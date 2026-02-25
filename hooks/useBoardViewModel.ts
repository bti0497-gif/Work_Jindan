import { useState, useMemo, useEffect } from 'react';
import { BoardPost } from '../types';
import { BoardRequestParams } from '../services/apiContract';
import { apiClient } from '../services/apiClient';

export const useBoardViewModel = (initialPosts: BoardPost[], autoLoad: boolean = true) => {
  const [posts, setPosts] = useState<BoardPost[]>(initialPosts);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'list' | 'detail' | 'form'>('list');
  const [selectedPost, setSelectedPost] = useState<BoardPost | null>(null);
  const [editingPost, setEditingPost] = useState<BoardPost | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [queryParams, setQueryParams] = useState<BoardRequestParams>({
    page: 1,
    limit: 10,
    sortBy: 'latest'
  });

  const reloadPosts = () => setReloadTick(t => t + 1);

  useEffect(() => {
    if (!autoLoad) return;
    const load = async () => {
      try {
        const query = new URLSearchParams({
          page: queryParams.page.toString(),
          limit: queryParams.limit.toString(),
          sortBy: queryParams.sortBy ?? 'latest',
          ...(queryParams.keyword ? { keyword: queryParams.keyword } : {})
        });
        const response = await apiClient.get<{ items: BoardPost[]; totalCount: number }>(`/board?${query.toString()}`);
        setPosts(response.items ?? []);
        setTotalCount(response.totalCount ?? 0);
      } catch (error) {
        console.error('Failed to load board posts', error);
      }
    };

    load();
  }, [queryParams, autoLoad, reloadTick]);

  // 서버에서 이미 정렬/페이지 처리된 데이터이므로 키워드 필터만 클라이언트에서 추가 적용
  const filteredPosts = useMemo(() => {
    if (!queryParams.keyword) return posts;
    const kw = queryParams.keyword.toLowerCase();
    return posts.filter(p =>
      p.title.toLowerCase().includes(kw) ||
      p.content.toLowerCase().includes(kw)
    );
  }, [posts, queryParams.keyword]);

  const actions = {
    setSearch: (keyword: string) => setQueryParams(prev => ({ ...prev, keyword, page: 1 })),
    setSort: (sortBy: BoardRequestParams['sortBy']) => setQueryParams(prev => ({ ...prev, sortBy, page: 1 })),
    setPage: (page: number) => setQueryParams(prev => ({ ...prev, page })),

    addPost: async (post: BoardPost) => {
      await apiClient.post<BoardPost>('/board', post);
      // 새 글 작성 후 1페이지로 돌아가며 전체 목록 새로고침
      setQueryParams(prev => ({ ...prev, page: 1 }));
      reloadPosts();
    },
    updatePost: async (updated: BoardPost) => {
      await apiClient.patch<BoardPost>(`/board/${updated.id}`, updated);
      reloadPosts();
    },
    deletePost: async (id: string) => {
      await apiClient.delete(`/board/${id}`);
      reloadPosts();
    },

    openDetail: (post: BoardPost) => {
      setSelectedPost(post);
      setViewMode('detail');
    },

    openForm: (post?: BoardPost) => {
      setEditingPost(post ?? null);
      setViewMode('form');
    },

    openEdit: (post: BoardPost) => {
      setEditingPost(post);
      setViewMode('form');
    },

    close: () => {
      setSelectedPost(null);
      setEditingPost(null);
      setViewMode('list');
    },
    backToList: () => {
      setSelectedPost(null);
      setEditingPost(null);
      setViewMode('list');
    }
  };

  return {
    posts: filteredPosts,
    totalCount,
    viewMode,
    selectedPost,
    editingPost,
    queryParams,
    actions
  };
};
