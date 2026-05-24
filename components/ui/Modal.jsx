"use client";
import { T } from "@/lib/helpers";
import { motion } from "framer-motion";

export default function Modal({ open, onClose, title, children, width = 560 }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 backdrop-blur-sm transition-colors duration-200"
      style={{ background: "var(--overlay-scrim)" }}
      onClick={() => onClose?.()}
    >
      <motion.div
        className="max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-(--app-border-strong) bg-(--app-surface) shadow-[0_30px_80px_rgba(0,0,0,0.35)] transition-colors duration-200 dark:shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        style={{ maxWidth: width }}
        initial={{ opacity: 0, y: 10, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.99 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <span style={T.h2}>{title}</span>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="cursor-pointer border-none bg-transparent text-2xl text-(--text-muted) hover:text-(--text-heading)"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </motion.div>
    </div>
  );
}
