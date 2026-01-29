
export interface Project {
  id: string;
  title: string;
  description: string;
  progress: number;
  status: 'In Progress' | 'Completed';
  dueDate: string;
  members: string[]; // URLs of avatars
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  detailAddress: string;
  avatar: string;
  role: 'master' | 'admin' | 'user';
}

export interface Message {
  id: string;
  sender: string;
  avatar: string;
  text: string;
  time: string;
}

export interface Task {
  id: string;
  text: string;
  targetDate: string;
  regDate: string;
  completed: boolean;
  author: string;
  authorId: string;
  authorAvatar: string;
  isPublic: boolean;
}

export interface BoardPost {
  id: string;
  title: string;
  content: string;
  author: string;
  authorId: string;
  authorAvatar: string;
  regDate: string;
  views: number;
}

export interface Notification {
  id: string;
  text: string;
  time: string;
  type: 'info' | 'alert' | 'success';
}

export interface ProcessLog {
  id: string;
  projectName: string;
  step: string;
  status: 'Completed' | 'In Progress' | 'Standby';
  updatedAt: string;
}

export interface Process {
  id: string;
  projectId: string;
  title: string;
  startDate: string;
  endDate: string;
  members: string[]; // Avatar URLs
  description: string;
  isCompleted: boolean;
}

export interface FileInfo {
  id: string;
  name: string;
  size: string;
  date: string;
  user: string;
  action: 'Uploaded' | 'Deleted';
  type: 'pdf' | 'xlsx' | 'docx' | 'png' | 'zip';
}
