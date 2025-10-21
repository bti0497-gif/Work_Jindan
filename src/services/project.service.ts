import prisma, { executeTransaction } from '../lib/prisma';
import { CreateProjectData, UpdateProjectData, ProjectFilter } from '../types/api';

export class ProjectService {
  // 프로젝트 목록 조회
  static async getProjects(filter?: ProjectFilter) {
    const where: any = {};
    
    if (filter?.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
        { facilityName: { contains: filter.search, mode: 'insensitive' } }
      ];
    }
    
    if (filter?.status) {
      where.status = filter.status;
    }
    
    if (filter?.ownerId) {
      where.ownerId = filter.ownerId;
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            }
          }
        },
        _count: {
          select: {
            members: true,
            schedules: true,
            tasks: true,
            files: true,
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    // 데이터 변환
    return projects.map(project => ({
      ...project,
      memberCount: project._count.members + 1, // 소유자 포함
      scheduleCount: project._count.schedules,
      taskCount: project._count.tasks,
      fileCount: project._count.files,
    }));
  }

  // 단일 프로젝트 조회
  static async getProjectById(id: string, userId: string) {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            }
          }
        },
        facilityContacts: true,
        _count: {
          select: {
            schedules: true,
            tasks: true,
            files: true,
          }
        }
      }
    });

    if (!project) {
      throw new Error('프로젝트를 찾을 수 없습니다.');
    }

    // 접근 권한 확인
    const hasAccess = project.ownerId === userId || 
                     project.members.some(member => member.userId === userId);

    if (!hasAccess) {
      throw new Error('프로젝트에 접근 권한이 없습니다.');
    }

    return {
      ...project,
      memberCount: project.members.length + 1, // 소유자 포함
      scheduleCount: project._count.schedules,
      taskCount: project._count.tasks,
      fileCount: project._count.files,
    };
  }

  // 프로젝트 생성
  static async createProject(data: CreateProjectData, ownerId: string) {
    return executeTransaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          ...data,
          ownerId,
          status: data.status || 'planning',
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            }
          },
          _count: {
            select: {
              members: true,
              schedules: true, 
              tasks: true,
              files: true,
            }
          }
        }
      });

      return {
        ...project,
        memberCount: project._count.members + 1,
        scheduleCount: project._count.schedules,
        taskCount: project._count.tasks,
        fileCount: project._count.files,
      };
    });
  }

  // 프로젝트 수정
  static async updateProject(id: string, data: UpdateProjectData, userId: string) {
    return executeTransaction(async (tx) => {
      // 권한 확인
      const project = await tx.project.findUnique({
        where: { id },
        include: {
          members: true
        }
      });

      if (!project) {
        throw new Error('프로젝트를 찾을 수 없습니다.');
      }

      const hasPermission = project.ownerId === userId || 
                           project.members.some(member => member.userId === userId);

      if (!hasPermission) {
        throw new Error('프로젝트 수정 권한이 없습니다.');
      }

      const updatedProject = await tx.project.update({
        where: { id },
        data: {
          ...data,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            }
          },
          _count: {
            select: {
              members: true,
              schedules: true,
              tasks: true,
              files: true,
            }
          }
        }
      });

      return {
        ...updatedProject,
        memberCount: updatedProject._count.members + 1,
        scheduleCount: updatedProject._count.schedules,
        taskCount: updatedProject._count.tasks,
        fileCount: updatedProject._count.files,
      };
    });
  }

  // 프로젝트 삭제
  static async deleteProject(id: string, userId: string) {
    return executeTransaction(async (tx) => {
      // 권한 확인 (소유자만 삭제 가능)
      const project = await tx.project.findUnique({
        where: { id },
        select: { ownerId: true }
      });

      if (!project) {
        throw new Error('프로젝트를 찾을 수 없습니다.');
      }

      if (project.ownerId !== userId) {
        throw new Error('프로젝트 삭제 권한이 없습니다.');
      }

      // 관련 데이터 삭제 (Cascade로 처리되지만 명시적으로)
      await tx.projectFile.deleteMany({ where: { projectId: id } });
      await tx.task.deleteMany({ where: { projectId: id } });
      await tx.schedule.deleteMany({ where: { projectId: id } });
      await tx.milestone.deleteMany({ where: { projectId: id } });
      await tx.projectMember.deleteMany({ where: { projectId: id } });
      await tx.facilityContact.deleteMany({ where: { projectId: id } });
      await tx.message.deleteMany({ where: { projectId: id } });

      // 마지막으로 프로젝트 삭제
      await tx.project.delete({ where: { id } });

      return true;
    });
  }

  // 프로젝트 멤버 관리
  static async addProjectMember(projectId: string, userId: string, role: string = 'member', specialty?: string, requesterId?: string) {
    return executeTransaction(async (tx) => {
      // 권한 확인 (소유자 또는 관리자만)
      if (requesterId) {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          include: { members: true }
        });

        if (!project) {
          throw new Error('프로젝트를 찾을 수 없습니다.');
        }

        const hasPermission = project.ownerId === requesterId ||
                             project.members.some(m => m.userId === requesterId && m.role === 'admin');

        if (!hasPermission) {
          throw new Error('멤버 추가 권한이 없습니다.');
        }
      }

      // 이미 멤버인지 확인
      const existingMember = await tx.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId
          }
        }
      });

      if (existingMember) {
        throw new Error('이미 프로젝트 멤버입니다.');
      }

      return await tx.projectMember.create({
        data: {
          projectId,
          userId,
          role,
          specialty,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            }
          }
        }
      });
    });
  }

  // 프로젝트 멤버 제거
  static async removeProjectMember(projectId: string, userId: string, requesterId?: string) {
    return executeTransaction(async (tx) => {
      // 권한 확인
      if (requesterId && requesterId !== userId) {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          include: { members: true }
        });

        if (!project) {
          throw new Error('프로젝트를 찾을 수 없습니다.');
        }

        const hasPermission = project.ownerId === requesterId ||
                             project.members.some(m => m.userId === requesterId && m.role === 'admin');

        if (!hasPermission) {
          throw new Error('멤버 제거 권한이 없습니다.');
        }
      }

      await tx.projectMember.delete({
        where: {
          projectId_userId: {
            projectId,
            userId
          }
        }
      });

      return true;
    });
  }
}