'use client';

import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';

export function PageTransition({ children }: { children: ReactNode; }) {
  const pathname = usePathname();

  const variants = {
    initial: {
      opacity: 0,
      duration: 0.5
    },
    animate: {
      opacity: 1,
      transition: {
        duration: 1,
      },
    },
    exit: {
      opacity: 0,
      transition: {
        duration: 1,
      },
    },
  };

  return (
    <motion.div
      key={ pathname }
      initial="initial"
      animate="animate"
      exit="exit"
      variants={ variants }
    >
      { children }
    </motion.div>
  );
}
