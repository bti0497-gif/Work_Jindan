'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

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

export default function FreeBoard() {
  const { data: session } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<PostDetail | null>(null);
  const [showWriteForm, setShowWriteForm] = useState(false);
  const [showPostDetail, setShowPostDetail] = useState(false);
  const [loading, setLoading] = useState(true);
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
      }
    } catch (error) {
      console.error('게시글 목록 조회 실패:', error);
    }
  };

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

  if (loading) return <div className="p-4">로딩 중...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">자유게시판</h1>
          {!showWriteForm && !showPostDetail && (
            <button
              onClick={() => setShowWriteForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              글쓰기
            </button>
          )}
        </div>
      </div>

      {/* 글쓰기 폼 */}
      {showWriteForm && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">새 게시글 작성</h2>
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
              <input
                type="text"
                placeholder="제목을 입력하세요"
                value={newPost.title}
                onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
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
                <label htmlFor="isNotice" className="ml-2 text-sm text-gray-700">
                  공지사항으로 등록
                </label>
              </div>
            )}
            
            <div>
              <textarea
                placeholder="내용을 입력하세요"
                value={newPost.content}
                onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                rows={8}
                required
              />
            </div>
            
            <div className="flex space-x-2">
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                등록
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowWriteForm(false);
                  setNewPost({ title: '', content: '', isNotice: false });
                }}
                className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 transition-colors"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 게시글 상세보기 */}
      {showPostDetail && selectedPost && (
        <div className="bg-white shadow rounded-lg mb-6">
          {/* 게시글 헤더 */}
          <div className="border-b border-gray-200 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                {selectedPost.isNotice && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 mb-2">
                    공지사항
                  </span>
                )}
                <h1 className="text-xl font-bold text-gray-900">{selectedPost.title}</h1>
              </div>
              <button
                onClick={() => {
                  setShowPostDetail(false);
                  setSelectedPost(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="flex items-center justify-between text-sm text-gray-500">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span>{selectedPost.author.name}</span>
                  {getUserLevelBadge(selectedPost.author.userLevel)}
                </div>
                <span>조회 {selectedPost.viewCount}</span>
                <span>댓글 {selectedPost._count.comments}</span>
              </div>
              <span>{formatDistanceToNow(new Date(selectedPost.createdAt), { addSuffix: true, locale: ko })}</span>
            </div>
          </div>

          {/* 게시글 내용 */}
          <div className="p-6">
            <div className="prose max-w-none">
              {selectedPost.content.split('\n').map((line, index) => (
                <p key={index} className="mb-2">
                  {line || <br />}
                </p>
              ))}
            </div>
          </div>

          {/* 댓글 섹션 */}
          <div className="border-t border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">댓글 ({selectedPost.comments.length})</h3>
            
            {/* 댓글 작성 폼 */}
            <form onSubmit={handleSubmitComment} className="mb-6">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="댓글을 입력하세요"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                required
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  댓글 등록
                </button>
              </div>
            </form>

            {/* 댓글 목록 */}
            <div className="space-y-4">
              {selectedPost.comments.map((comment) => (
                <div key={comment.id} className="border-b border-gray-100 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">{comment.author.name}</span>
                      {getUserLevelBadge(comment.author.userLevel)}
                      <span className="text-sm text-gray-500">
                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: ko })}
                      </span>
                    </div>
                    
                    {comment.author.id === session?.user?.id && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            setEditingComment(comment.id);
                            setEditCommentContent(comment.content);
                          }}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
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
                        className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
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
        <div className="bg-white shadow rounded-lg overflow-hidden">
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
                {posts.map((post) => (
                  <tr
                    key={post.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => fetchPostDetail(post.id)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        {post.isNotice && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            공지
                          </span>
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {post.viewCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {post._count.comments}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}