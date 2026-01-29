import { useState, useMemo, useCallback } from 'react';
import { BoardPost } from '@/types/common';
import { BoardRequestParams } from '@/services/apiContract';

export const useBoardViewModel = (initialPosts: BoardPost[]) => {
  const [posts, setPosts] = useState<BoardPost[]>(initialPosts);
  const [viewMode, setViewMode] = useState<'list' | 'detail' | 'form'>('list');
  const [selectedPost, setSelectedPost] = useState<BoardPost | null>(null);
  const [editingPost, setEditingPost] = useState<BoardPost | null>(null);
  
  // 조회 조건 관리 (백엔드와 통신할 파라미터셋)
  const [queryParams, setQueryParams] = useState<BoardRequestParams>({
    page: 1,
    limit: 10,
    sortBy: 'latest'
  });

  // 검색 및 정렬 로직 (고급 조회용)
  const filteredAndSortedPosts = useMemo(() => {
    let result = [...posts];

    // 1. 키워드 검색
    if (queryParams.keyword) {
      result = result.filter(p => 
        p.title.toLowerCase().includes(queryParams.keyword!.toLowerCase()) ||
        p.content.toLowerCase().includes(queryParams.keyword!.toLowerCase())
      );
    }

    // 2. 정렬 로직
    result.sort((a, b) => {
      if (queryParams.sortBy === 'views') return b.views - a.views;
      if (queryParams.sortBy === 'oldest') return a.id.localeCompare(b.id);
      return b.id.localeCompare(a.id); // latest default
    });

    return result;
  }, [posts, queryParams]);

  const actions = {
    setSearch: (keyword: string) => setQueryParams(prev => ({ ...prev, keyword, page: 1 })),
    setSort: (sortBy: BoardRequestParams['sortBy']) => setQueryParams(prev => ({ ...prev, sortBy })),
    setPage: (page: number) => setQueryParams(prev => ({ ...prev, page })),
    
    addPost: (post: BoardPost) => setPosts(prev => [post, ...prev]),
    updatePost: (updated: BoardPost) => setPosts(prev => prev.map(p => p.id === updated.id ? updated : p)),
    deletePost: (id: string) => setPosts(prev => prev.filter(p => p.id !== id)),

    openDetail: (post: BoardPost) => {
      setSelectedPost(post);
      setViewMode('detail');
      // 실제 구현시 여기서 조회수 증가 API 호출
    },

    openForm: (post?: BoardPost) => {
      setEditingPost(post || null);
      setViewMode('form');
    },

    backToList: () => {
      setViewMode('list');
      setSelectedPost(null);
      setEditingPost(null);
    }
  };

  return {
    posts: filteredAndSortedPosts,
    viewMode,
    selectedPost,
    editingPost,
    queryParams,
    actions
  };
};
