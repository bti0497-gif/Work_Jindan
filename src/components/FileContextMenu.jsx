import { useLayoutEffect, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const FileContextMenu = ({ x, y, label, items, onClose }) => {
    const menuRef = useRef(null);

    useLayoutEffect(() => {
        const menu = menuRef.current;
        const rect = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
        menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    }, [x, y, label]);

    useEffect(() => {
        const dismissOutside = event => {
            if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) onClose(false);
        };
        const dismiss = () => onClose(false);
        document.addEventListener('mousedown', dismissOutside, true);
        window.addEventListener('scroll', dismissOutside, true);
        window.addEventListener('resize', dismiss);
        window.addEventListener('blur', dismiss);
        return () => {
            document.removeEventListener('mousedown', dismissOutside, true);
            window.removeEventListener('scroll', dismissOutside, true);
            window.removeEventListener('resize', dismiss);
            window.removeEventListener('blur', dismiss);
        };
    }, [onClose]);

    const handleKeyDown = event => {
        event.stopPropagation();
        if (event.key === 'Escape' || event.key === 'Tab') {
            event.preventDefault();
            onClose(true);
            return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...menuRef.current.querySelectorAll('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
    };

    return createPortal(
        <div
            ref={menuRef}
            className="file-context-menu"
            role="menu"
            aria-label="파일 작업 메뉴"
            style={{ left: x, top: y }}
            onKeyDown={handleKeyDown}
            onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
        >
            <div className="file-context-label" title={label}>{label}</div>
            {items.map(item => (
                <div key={item.id} role="none">
                    {item.separatorBefore && <div className="file-context-separator" role="separator" />}
                    <button
                        type="button"
                        role="menuitem"
                        className={`file-context-action ${item.danger ? 'danger' : ''}`}
                        disabled={item.disabled}
                        title={item.title || item.label}
                        onClick={() => {
                            onClose(true);
                            item.onSelect();
                        }}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                        {item.shortcut && <kbd>{item.shortcut}</kbd>}
                    </button>
                </div>
            ))}
            <style>{`
                .file-context-menu { position: fixed; z-index: 10000; width: 246px; max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); overflow-y: auto; box-sizing: border-box; padding: 6px; border: 1px solid #dbe2ea; border-radius: 10px; background: #fff; box-shadow: 0 12px 36px rgba(15,23,42,.2); color: #334155; font: 13px/1.4 sans-serif; }
                .file-context-label { padding: 5px 10px 8px; color: #64748b; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .file-context-action { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; background: transparent; color: inherit; border: none; border-radius: 5px; font: inherit; text-align: left; cursor: pointer; }
                .file-context-action:hover:not(:disabled), .file-context-action:focus-visible { background: #eff6ff; outline: none; }
                .file-context-action:disabled { opacity: .4; cursor: not-allowed; }
                .file-context-action.danger { color: #dc2626; }
                .file-context-action.danger:hover, .file-context-action.danger:focus-visible { background: #fef2f2; }
                .file-context-action > svg { flex-shrink: 0; }
                .file-context-action kbd { margin-left: auto; color: #94a3b8; font: 11px sans-serif; }
                .file-context-separator { height: 1px; margin: 5px 4px; background: #e2e8f0; }
            `}</style>
        </div>,
        document.body
    );
};

export default FileContextMenu;
