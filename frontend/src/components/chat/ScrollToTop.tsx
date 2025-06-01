'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp } from 'lucide-react'
import { ScrollState } from '@/lib/ScrollManager'

interface ScrollToTopProps {
  scrollState: ScrollState
  scrollManager: { scrollTo: (position: number, options?: { smooth?: boolean }) => void }
  threshold?: number
}

export const ScrollToTop: React.FC<ScrollToTopProps> = ({
  scrollState,
  scrollManager,
  threshold = 1000
}) => {
  const show = scrollState.scrollPosition > threshold && !scrollState.isAtBottom

  const handleClick = () => {
    if (scrollManager && scrollManager.scrollTo) {
      scrollManager.scrollTo(0, { smooth: true })
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed bottom-[141px] right-6 p-1 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-md z-50 transition-all group"
          onClick={handleClick}
          aria-label="Scroll to top"
        >
          <ChevronUp className="w-3 h-3 text-gray-500 group-hover:text-gray-700" />
        </motion.button>
      )}
    </AnimatePresence>
  )
}