'use client';

import React from 'react';

interface ModalProps {
  children: React.ReactNode;
  isOpen: boolean;
}

const Modal = ({ children, isOpen }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        {children}
      </div>
    </div>
  );
};

export default Modal;
