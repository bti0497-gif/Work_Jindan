import { useCallback, useEffect, useRef, useState } from 'react';

export const useImageTransform = () => {
    const [zoom, setZoom] = useState(1);
    const imageRef = useRef(null);
    const stageRef = useRef(null);
    const transform = useRef({ zoom: 1, x: 0, y: 0 });
    const displayedZoom = useRef(1);
    const frame = useRef(null);
    const drag = useRef(null);
    const paint = useCallback(() => {
        frame.current = null;
        const current = transform.current;
        if (imageRef.current) {
            imageRef.current.style.transform = `translate3d(${current.x}px, ${current.y}px, 0) scale(${current.zoom})`;
            imageRef.current.classList.toggle('is-zoomed', current.zoom > 1);
        }
        if (displayedZoom.current !== current.zoom) {
            displayedZoom.current = current.zoom;
            setZoom(current.zoom);
        }
    }, []);
    const queuePaint = useCallback(() => {
        if (frame.current === null) frame.current = window.requestAnimationFrame(paint);
    }, [paint]);
    const resetView = useCallback(() => {
        transform.current = { zoom: 1, x: 0, y: 0 };
        drag.current = null;
        queuePaint();
    }, [queuePaint]);
    const changeZoom = useCallback(update => {
        const current = transform.current;
        transform.current = { ...current, zoom: Math.min(4, Math.max(0.5, update(current.zoom))) };
        queuePaint();
    }, [queuePaint]);

    useEffect(() => {
        const stage = stageRef.current;
        const handleWheel = event => {
            event.preventDefault();
            const current = transform.current;
            const nextZoom = Math.min(4, Math.max(0.5, current.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
            const bounds = stage.getBoundingClientRect();
            const x = event.clientX - (bounds.left + bounds.width / 2);
            const y = event.clientY - (bounds.top + bounds.height / 2);
            const ratio = nextZoom / current.zoom;
            transform.current = {
                zoom: nextZoom,
                x: x - (x - current.x) * ratio,
                y: y - (y - current.y) * ratio
            };
            queuePaint();
        };
        stage.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            stage.removeEventListener('wheel', handleWheel);
            if (frame.current !== null) window.cancelAnimationFrame(frame.current);
            frame.current = null;
        };
    }, [queuePaint]);

    return {
        zoom, imageRef, stageRef, resetView, changeZoom, onImageLoad: queuePaint,
        onPointerDown: event => {
            if (transform.current.zoom <= 1) return;
            drag.current = { pointerX: event.clientX, pointerY: event.clientY, x: transform.current.x, y: transform.current.y };
            event.currentTarget.setPointerCapture(event.pointerId);
        },
        onPointerMove: event => {
            const origin = drag.current;
            if (!origin) return;
            transform.current = { ...transform.current, x: origin.x + event.clientX - origin.pointerX, y: origin.y + event.clientY - origin.pointerY };
            queuePaint();
        },
        onPointerEnd: () => { drag.current = null; }
    };
};
