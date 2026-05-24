"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";

/** Dashboard-only route transitions; keeps root `Providers` (session + theme) lightweight for auth pages. */
export default function PageTransition({ children }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="min-w-0 w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
