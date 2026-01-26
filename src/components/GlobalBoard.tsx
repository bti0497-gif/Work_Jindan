'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { MessageSquare, Eye, User, Calendar, Edit, Trash2, Pin, Search } from 'lucide-react';

interface Post {
  id: string;
  title: string;
  content: string;
  isNotice: boolean;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    email: string;
    userLevel: number;
  };
  _count: {
    comments: number;
  };
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    email: string;
    userLevel: number;
  };
}

interface PostDetail extends Post {
  comments: Comment[];
}

export default function GlobalBoard() {
  const { data: session } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<PostDetail | null>(null);
  const [showWriteForm, setShowWriteForm] = useState(false);
  const [showPostDetail, setShowPostDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);
  const [newPost, setNewPost] = useState({
    title: '',
    content: '',
    isNotice: false,
  });
  const [newComment, setNewComment] = useState('');
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editCommentContent, setEditCommentContent] = useState('');

  // 게시글 목록 조회
  const fetchPosts = async () => {
    try {
      const response = await fetch('/api/posts');
      if (response.ok) {
        const data = await response.json();
        setPosts(data.posts);
        setFilteredPosts(data.posts);
      }
    } catch (error) {
      console.error('게시글 목록 조회 실패:', error);
    }
  };

  // 검색 기능
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredPosts(posts);
    } else {
      const filtered = posts.filter(post =>
        post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.author.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredPosts(filtered);
    }
  }, [searchTerm, posts]);

  // 특정 게시글 상세 조회
  const fetchPostDetail = async (postId: string) => {
    try {
      // 조회수 증가
      await fetch(`/api/posts/${postId}/view`, { method: 'POST' });
      
      const response = await fetch(`/api/posts/${postId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedPost(data.post);
        setShowPostDetail(true);
      }
    } catch (error) {
      console.error('게시글 상세 조회 실패:', error);
    }
  };

  // 게시글 작성
  const handleSubmitPost = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newPost),
      });

      if (response.ok) {
        await fetchPosts();
        setShowWriteForm(false);
        setNewPost({ title: '', content: '', isNotice: false });
        alert('게시글이 등록되었습니다.');
      } else {
        alert('게시글 등록에 실패했습니다.');
      }
    } catch (error) {
      console.error('게시글 작성 실패:', error);
      alert('게시글 작성 중 오류가 발생했습니다.');
    }
  };

  // 댓글 작성
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPost || !newComment.trim()) return;

    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          postId: selectedPost.id,
          content: newComment,
        }),
      });

      if (response.ok) {
        await fetchPostDetail(selectedPost.id);
        setNewComment('');
      } else {
        alert('댓글 등록에 실패했습니다.');
      }
    } catch (error) {
      console.error('댓글 작성 실패:', error);
      alert('댓글 작성 중 오류가 발생했습니다.');
    }
  };

  // 댓글 수정
  const handleUpdateComment = async (commentId: string) => {
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: editCommentContent,
        }),
      });

      if (response.ok) {
        await fetchPostDetail(selectedPost!.id);
        setEditingComment(null);
        setEditCommentContent('');
      } else {
        alert('댓글 수정에 실패했습니다.');
      }
    } catch (error) {
      console.error('댓글 수정 실패:', error);
      alert('댓글 수정 중 오류가 발생했습니다.');
    }
  };

  // 댓글 삭제
  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchPostDetail(selectedPost!.id);
      } else {
        alert('댓글 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('댓글 삭제 실패:', error);
      alert('댓글 삭제 중 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    if (session?.user) {
      fetchPosts();
      setLoading(false);
    }
  }, [session]);

  const getUserLevelBadge = (level: number) => {
    switch (level) {
      case 0: return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">관리자</span>;
      case 1: return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">매니저</span>;
      case 2: return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">팀원</span>;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  // Helper to determine if a post is new within 24 hours
  const isNewPost = (p: Post) => {
    try {
      const diff = Date.now() - new Date(p.createdAt).getTime();
      return diff <= 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
            <MessageSquare className="h-6 w-6 mr-2" />
            전체 게시판
          </h2>
          <p className="text-gray-600 mt-1">모든 프로젝트 구성원이 공유하는 전체 소통 공간입니다.</p>
        </div>
        {!showWriteForm && !showPostDetail && (
          <button
            onClick={() => setShowWriteForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
          >
            <Edit className="h-4 w-4" />
            <span>글쓰기</span>
          </button>
        )}
      </div>

      {/* 검색 및 필터 */}
      {!showWriteForm && !showPostDetail && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="제목, 내용, 작성자로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="text-sm text-gray-500">
              총 {filteredPosts.length}개의 게시글
            </div>
          </div>
        </div>
      )}

      {/* 글쓰기 폼 */}
      {showWriteForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">새 게시글 작성</h3>
            <button
              onClick={() => {
                setShowWriteForm(false);
                setNewPost({ title: '', content: '', isNotice: false });
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          
          <form onSubmit={handleSubmitPost} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">제목</label>
              <input
                type="text"
                placeholder="제목을 입력하세요"
                value={newPost.title}
                onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            {session?.user?.userLevel !== undefined && session.user.userLevel <= 1 && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isNotice"
                  checked={newPost.isNotice}
                  onChange={(e) => setNewPost({ ...newPost, isNotice: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="isNotice" className="ml-2 text-sm text-gray-700 flex items-center">
                  <Pin className="h-4 w-4 mr-1 text-red-500" />
                  공지사항으로 등록
                </label>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">내용</label>
              <textarea
                placeholder="내용을 입력하세요"
                value={newPost.content}
                onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={8}
                required
              />
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowWriteForm(false);
                  setNewPost({ title: '', content: '', isNotice: false });
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
              >
                등록
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 게시글 상세보기 */}
      {showPostDetail && selectedPost && (
        <div className="bg-white border border-gray-200 rounded-lg">
          {/* 게시글 헤더 */}
          <div className="border-b border-gray-200 p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                {selectedPost.isNotice && (
                  <div className="flex items-center mb-2">
                    <Pin className="h-4 w-4 text-red-500 mr-1" />
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      공지사항
                    </span>
                  </div>
                )}
                <h1 className="text-xl font-bold text-gray-900">{selectedPost.title}</h1>
              </div>
              <button
                onClick={() => {
                  setShowPostDetail(false);
                  setSelectedPost(null);
                }}
                className="text-gray-500 hover:text-gray-700 ml-4"
              >
                ✕
              </button>
            </div>
            
            <div className="flex items-center justify-between text-sm text-gray-500">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span>{selectedPost.author.name}</span>
                  {getUserLevelBadge(selectedPost.author.userLevel)}
                </div>
                <div className="flex items-center space-x-1">
                  <Eye className="h-4 w-4" />
                  <span>{selectedPost.viewCount}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <MessageSquare className="h-4 w-4" />
                  <span>{selectedPost._count.comments}</span>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <Calendar className="h-4 w-4" />
                <span>{formatDistanceToNow(new Date(selectedPost.createdAt), { addSuffix: true, locale: ko })}</span>
              </div>
            </div>
          </div>

          {/* 게시글 내용 */}
          <div className="p-6">
            <div className="prose max-w-none">
              {selectedPost.content.split('\n').map((line, index) => (
                <p key={index} className="mb-2 text-gray-700">
                  {line || <br />}
                </p>
              ))}
            </div>
          </div>

          {/* 댓글 섹션 */}
          <div className="border-t border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <MessageSquare className="h-5 w-5 mr-2" />
              댓글 ({selectedPost.comments.length})
            </h3>
            
            {/* 댓글 작성 폼 */}
            <form onSubmit={handleSubmitComment} className="mb-6">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="댓글을 입력하세요"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                required
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                >
                  댓글 등록
                </button>
              </div>
            </form>

            {/* 댓글 목록 */}
            <div className="space-y-4">
              {selectedPost.comments.map((comment) => (
                <div key={comment.id} className="border-b border-gray-100 pb-4 last:border-b-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">{comment.author.name}</span>
                      {getUserLevelBadge(comment.author.userLevel)}
                      <span className="text-sm text-gray-500">
                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: ko })}
                      </span>
                    </div>
                    
                    {comment.author.id === session?.user?.id && (
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setEditingComment(comment.id);
                            setEditCommentContent(comment.content);
                          }}
                          className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          수정
                        </button>
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="text-sm text-red-600 hover:text-red-800 flex items-center"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {editingComment === comment.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editCommentContent}
                        onChange={(e) => setEditCommentContent(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={3}
                      />
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleUpdateComment(comment.id)}
                          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => {
                            setEditingComment(null);
                            setEditCommentContent('');
                          }}
                          className="text-sm bg-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-400"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-700">{comment.content}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 게시글 목록 */}
      {!showWriteForm && !showPostDetail && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    제목
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    작성자
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    작성일
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    조회수
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    댓글
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
            {filteredPosts.map((post) => {
              const isNew = isNewPost(post);
              return (
                <div key={post.id} className="border-b pb-3 last:border-b-0 hover:bg-gray-50 p-3 cursor-pointer" onClick={() => fetchPostDetail(post.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center">
                        {post.isNotice && (
                          <span className="inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full mr-1">N*</span>
                        )}
                        <span className="font-semibold text-gray-900">{post.title}</span>
                        {isNew && (
                          <span className="inline-flex items-center justify-center w-5 h-5 bg-red-600 text-white text-xs rounded-full ml-2">N</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: ko })}</span>
                  </div>
                </div>
              );
            })}
                  <tr
                    key={post.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => fetchPostDetail(post.id)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        {post.isNotice && (
                          <Pin className="h-4 w-4 text-red-500" />
                        )}
                        <span className="text-sm font-medium text-gray-900 hover:text-blue-600">
                          {post.title}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-900">{post.author.name}</span>
                        {getUserLevelBadge(post.author.userLevel)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: ko })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                      {post.viewCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                      {post._count.comments}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredPosts.length === 0 && (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm ? '검색 결과가 없습니다' : '게시글이 없습니다'}
              </h3>
              <p className="text-gray-500">
                {searchTerm ? '다른 키워드로 검색해보세요.' : '첫 번째 게시글을 작성해보세요.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
