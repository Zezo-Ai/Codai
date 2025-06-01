'use client'

interface SidebarFooterProps {
  version: string;
  edition: string;
}

export function SidebarFooter({ version, edition }: SidebarFooterProps) {
  return (
    <div className="px-5 pb-4">
      <div className="flex flex-col items-start space-y-1.5 text-xs">
        <div className="flex items-center space-x-1 text-gray-600">
          <div className="flex-shrink-0 bg-white rounded-full mr-1">
            <img src="/icon.png" alt="Codai Logo" className="h-4 w-4" />
          </div>
          <span>CODAI</span>
          <span className="text-indigo-600 font-semibold">{version}</span>
        </div>
        <div className="text-gray-400/80">
          {edition}
        </div>
        <div className="text-gray-400/60 text-[10px] mt-1">
          Created by{' '}
          <a 
            href="https://x.com/AriRudd" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-gray-500 transition-colors"
          >
            Arian Rudd
          </a>
          {' '}•{' '}
          <a 
            href="https://codai.ai" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-gray-500 transition-colors"
          >
            codai.ai
          </a>
        </div>
        <div className="flex items-center space-x-1 text-gray-600 mt-2">
          <span>Built with</span>
          <span className="animate-bounce">🐨</span>
          <span>in Australia</span>
        </div>
      </div>
    </div>
  )
}