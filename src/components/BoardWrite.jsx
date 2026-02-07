import React, { useState, useRef } from 'react';
import { saveJsonData, uploadResource } from '../services/dataService';

const BoardWrite = ({ menuName, onCancel, onSaveSuccess }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef(null);
    const editorRef = useRef(null);

    // 툴바 명령 실행
    const execCmd = (command, value = null) => {
        document.execCommand(command, false, value);
        if (editorRef.current) {
            setContent(editorRef.current.innerHTML);
        }
    };

    // 파일 선택 핸들러
    const handleFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files);
        setAttachments(prev => [...prev, ...selectedFiles]);
    };

    // 첨부 파일 제거
    const removeAttachment = (index) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    // 에디터 내용 변경 핸들러
    const handleContentChange = () => {
        // 타이핑 중에는 상태만 업데이트하고 DOM은 건드리지 않음 (composition 유지를 위해)
        if (editorRef.current) {
            setContent(editorRef.current.innerHTML);
        }
    };

    // 저장 실행
    const handleSubmit = async (e) => {
        if (e) e.preventDefault();

        // 최신 내용 가져오기
        const currentHTML = editorRef.current?.innerHTML || '';
        const textContent = editorRef.current?.innerText || '';

        if (!title.trim() || !textContent.trim() || textContent.trim() === '') {
            return alert('제목과 내용을 입력해 주세요.');
        }

        try {
            setIsSubmitting(true);

            // 1. 첨부파일 먼저 업로드
            const uploadedFiles = [];
            for (const file of attachments) {
                if (file.id) {
                    uploadedFiles.push(file);
                    continue;
                }
                const result = await uploadResource(file);
                uploadedFiles.push({
                    id: result.id,
                    name: file.name,
                    size: file.size,
                    mimeType: file.type || file.mimeType
                });
            }

            // 2. 게시글 데이터(JSON) 생성
            const postData = {
                id: crypto.randomUUID(),
                title,
                content: currentHTML, // 최신 HTML 내용 저장
                author: '홍길동 차장', // 추후 사용자 정보 연동
                createdAt: new Date().toISOString(),
                attachments: uploadedFiles,
                menu: menuName
            };

            // 3. 구글 드라이브에 JSON 저장
            await saveJsonData(menuName, postData);

            alert('게시글이 성공적으로 등록되었습니다.');
            if (onSaveSuccess) onSaveSuccess();
        } catch (err) {
            alert(`등록 실패: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-gray-50 dark:bg-background-dark flex justify-center w-full min-h-full">
            <div className="relative flex h-full w-full max-w-[650px] flex-col bg-white dark:bg-background-dark shadow-2xl overflow-hidden">
                <header className="flex items-center justify-center px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-background-dark z-10">
                    <h1 className="text-[#0d141b] dark:text-white text-lg font-bold leading-tight">{menuName}</h1>
                </header>

                {/* Fixed Top Section: Title & Toolbar */}
                <div className="flex flex-col bg-white dark:bg-background-dark z-10">
                    {/* Title Input */}
                    <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
                        <span className="text-gray-900 font-bold whitespace-nowrap text-sm">Title:</span>
                        <input
                            className="flex-1 border-none focus:ring-0 p-0 text-sm placeholder:text-gray-300 text-gray-900 font-medium"
                            placeholder="제목을 입력하세요"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    {/* Toolbar */}
                    <div className="bg-toolbar-bg border-b border-gray-200 px-3 py-2 flex items-center gap-0.5 overflow-x-auto no-scrollbar">
                        <div className="flex items-center gap-0.5 px-1 min-w-fit">
                            <select
                                onChange={(e) => execCmd('fontName', e.target.value)}
                                className="text-xs font-medium text-gray-700 bg-transparent border-none focus:ring-0 cursor-pointer h-full"
                            >
                                <option value="Plus Jakarta Sans">기본서체</option>
                                <option value="Arial">Arial</option>
                                <option value="Inter">Inter</option>
                                <option value="Outfit">Outfit</option>
                                <option value="Courier New">Courier</option>
                            </select>
                            <select
                                onChange={(e) => execCmd('fontSize', e.target.value)}
                                className="text-xs font-medium text-gray-700 bg-transparent border-none focus:ring-0 cursor-pointer h-full"
                            >
                                <option value="3">14</option>
                                <option value="1">10</option>
                                <option value="2">12</option>
                                <option value="4">16</option>
                                <option value="5">18</option>
                                <option value="6">24</option>
                                <option value="7">32</option>
                            </select>
                        </div>
                        <div className="divider"></div>
                        <button type="button" onClick={() => execCmd('bold')} className="toolbar-btn"><span className="material-symbols-outlined font-bold">format_bold</span></button>
                        <button type="button" onClick={() => execCmd('italic')} className="toolbar-btn"><span className="material-symbols-outlined">format_italic</span></button>
                        <button type="button" onClick={() => execCmd('underline')} className="toolbar-btn"><span className="material-symbols-outlined">format_underlined</span></button>
                        <button type="button" onClick={() => execCmd('strikeThrough')} className="toolbar-btn"><span className="material-symbols-outlined">strikethrough_s</span></button>

                        {/* Font Color Wrapper */}
                        <div className="relative group">
                            <button type="button" onClick={() => document.getElementById('foreColorPicker').click()} className="toolbar-btn">
                                <span className="material-symbols-outlined">format_color_text</span>
                            </button>
                            <input
                                id="foreColorPicker"
                                type="color"
                                className="absolute opacity-0 pointer-events-none"
                                onChange={(e) => execCmd('foreColor', e.target.value)}
                            />
                        </div>

                        {/* Background Color Wrapper */}
                        <div className="relative group">
                            <button type="button" onClick={() => document.getElementById('hiliteColorPicker').click()} className="toolbar-btn border border-gray-300 bg-white">
                                <span className="material-symbols-outlined">format_color_fill</span>
                            </button>
                            <input
                                id="hiliteColorPicker"
                                type="color"
                                className="absolute opacity-0 pointer-events-none"
                                onChange={(e) => execCmd('hiliteColor', e.target.value)}
                            />
                        </div>

                        <div className="divider"></div>
                        <button type="button" onClick={() => execCmd('justifyLeft')} className="toolbar-btn"><span className="material-symbols-outlined">format_align_left</span></button>
                        <button type="button" onClick={() => execCmd('justifyCenter')} className="toolbar-btn"><span className="material-symbols-outlined">format_align_center</span></button>
                        <button type="button" onClick={() => execCmd('justifyRight')} className="toolbar-btn"><span className="material-symbols-outlined">format_align_right</span></button>
                        <button type="button" onClick={() => execCmd('justifyFull')} className="toolbar-btn"><span className="material-symbols-outlined">format_align_justify</span></button>
                        <div className="divider"></div>
                        <button type="button" onClick={() => execCmd('insertUnorderedList')} className="toolbar-btn"><span className="material-symbols-outlined">format_list_bulleted</span></button>
                        <button type="button" onClick={() => execCmd('formatBlock', 'blockquote')} className="toolbar-btn"><span className="material-symbols-outlined">format_quote</span></button>
                        <button type="button" className="toolbar-btn"><span className="material-symbols-outlined">sentiment_satisfied</span></button>
                        <button type="button" className="toolbar-btn"><span className="material-symbols-outlined">table_chart</span></button>
                        <button type="button" onClick={() => {
                            const url = prompt('URL을 입력하세요:');
                            if (url) execCmd('createLink', url);
                        }} className="toolbar-btn"><span className="material-symbols-outlined">link</span></button>
                        <button type="button" className="toolbar-btn"><span className="material-symbols-outlined">blur_on</span></button>
                        <button type="button" onClick={() => execCmd('insertHorizontalRule')} className="toolbar-btn"><span className="material-symbols-outlined">horizontal_rule</span></button>
                        <div className="ml-auto flex items-center">
                            <button type="button" className="toolbar-btn"><span className="material-symbols-outlined">spellcheck</span></button>
                        </div>
                    </div>
                </div>

                {/* Scrollable Content Area */}
                <main className="flex-1 overflow-y-auto no-scrollbar">
                    <div className="flex flex-col p-4 px-8 pt-4">
                        <div className="text-gray-900 font-bold mb-1 text-sm">Content</div>
                        <div className="relative flex-1 flex flex-col">
                            <div
                                ref={editorRef}
                                className="w-full flex-1 border-none focus:ring-0 p-0 text-base leading-relaxed bg-transparent text-gray-900 outline-none min-h-[400px] not-italic"
                                contentEditable
                                onInput={handleContentChange}
                                onBlur={handleContentChange}
                                suppressContentEditableWarning={true}
                                data-placeholder="내용을 입력하세요"
                            />
                        </div>
                    </div>
                </main>

                {/* Fixed Bottom Footer: Integrated Attachments & Buttons */}
                <footer className="p-2 px-3 border-t border-gray-100 bg-white flex items-center justify-between gap-4">
                    {/* Compact File Attachment Area */}
                    <div className="flex flex-1 items-center gap-2 overflow-x-auto no-scrollbar min-w-0 py-1">
                        <div className="min-w-fit flex items-center gap-1.5 mr-2">
                            <span className="material-symbols-outlined text-gray-400 text-lg">attach_file</span>
                            <span className="text-[10px] text-gray-400 font-bold">{attachments.length}/10</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto no-scrollbar">
                            {attachments.map((file, idx) => (
                                <div key={idx} className="relative w-10 h-10 min-w-[40px] rounded border border-gray-100 group">
                                    {file.type?.startsWith('image/') ? (
                                        <div
                                            className="w-full h-full bg-cover bg-center rounded"
                                            style={{ backgroundImage: `url(${URL.createObjectURL(file)})` }}
                                        ></div>
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-50 text-[6px] text-center p-0.5 break-all rounded">
                                            <span className="material-symbols-outlined text-gray-300 text-sm">description</span>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => removeAttachment(idx)}
                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                                    >
                                        <span className="material-symbols-outlined text-[10px]">close</span>
                                    </button>
                                </div>
                            ))}
                            {attachments.length < 10 && (
                                <>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        style={{ display: 'none' }}
                                        multiple
                                        onChange={handleFileChange}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-10 h-10 min-w-[40px] rounded border border-dashed border-gray-200 flex items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-gray-300 text-lg">add</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-2 min-w-fit">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-6 py-2 border border-gray-200 rounded-lg text-gray-600 font-bold text-xs bg-white active:bg-gray-50"
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="px-6 py-2 bg-primary rounded-lg text-white font-bold text-xs shadow-sm active:opacity-90 disabled:opacity-50"
                        >
                            {isSubmitting ? '중...' : '등록하기'}
                        </button>
                    </div>
                </footer>

                <div className="h-4 bg-white"></div>
            </div>
        </div>
    );
};

export default BoardWrite;
