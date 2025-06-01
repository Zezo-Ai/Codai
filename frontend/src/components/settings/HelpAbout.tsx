'use client'

import { ExternalLink, Github, Twitter, Globe, Heart, BookOpen, MessageCircle } from 'lucide-react'

export function HelpAbout() {
  return (
    <div className="space-y-6">
      {/* About CODAI */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">About CODAI</h3>
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            CODAI - Evolved Intelligence. Turn ideas into production-ready apps and solutions with zero code required. 
            Simply describe what you want to build in plain English, and CODAI creates it for you.
            Build complete applications and business solutions using natural language.
          </p>
          <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
            <span>Version: 0.1.0</span>
            <span>•</span>
            <span>License: GPL-3.0</span>
          </div>
        </div>
      </div>

      {/* Creator */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Created By</h3>
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Arian Rudd</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Original Creator & Maintainer</p>
            </div>
            <div className="flex space-x-3">
              <a
                href="https://x.com/AriRudd"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors"
                title="Follow on X/Twitter"
              >
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="https://codai.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors"
                title="Visit CODAI website"
              >
                <Globe className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Quick Links</h3>
        <div className="space-y-2">
          <a
            href="https://codai.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <Globe className="h-5 w-5 text-gray-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Official Website</span>
            </div>
            <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
          </a>

          <a
            href="https://github.com/[your-username]/codai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <Github className="h-5 w-5 text-gray-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">GitHub Repository</span>
            </div>
            <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
          </a>

          <a
            href="https://codai.ai/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <BookOpen className="h-5 w-5 text-gray-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Documentation</span>
            </div>
            <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
          </a>

          <button
            onClick={() => window.open('https://github.com/[your-username]/codai/issues', '_blank')}
            className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <MessageCircle className="h-5 w-5 text-gray-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Report an Issue</span>
            </div>
            <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
          </button>
        </div>
      </div>

      {/* Attribution */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Attribution</h3>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            If you find CODAI useful in your work, we kindly request that you:
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
            <li>Keep the "CODAI" branding or mention "Based on CODAI"</li>
            <li>Include attribution: "Originally created by Arian Rudd"</li>
            <li>Link back to <a href="https://codai.ai" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">codai.ai</a> when practical</li>
          </ul>
        </div>
      </div>

      {/* Support */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Support CODAI</h3>
        <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Heart className="h-5 w-5 text-pink-500 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                CODAI represents a significant investment of time and effort. If you find it useful, please consider:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                <li>⭐ Starring the repository on GitHub</li>
                <li>🔗 Sharing your experience with others</li>
                <li>🐛 Contributing bug reports or features</li>
                <li>📣 Following <a href="https://x.com/AriRudd" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">@AriRudd</a> on X/Twitter</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Keyboard Shortcuts</h3>
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">New Chat</span>
              <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs">Ctrl/Cmd + K</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Toggle Sidebar</span>
              <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs">Ctrl/Cmd + B</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Send Message</span>
              <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs">Enter</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">New Line</span>
              <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs">Shift + Enter</kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}