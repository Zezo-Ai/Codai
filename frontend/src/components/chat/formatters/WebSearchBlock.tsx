'use client'

import { useState, useEffect, useRef } from 'react'
import { Copy, ExternalLink, Search, AlertTriangle } from 'lucide-react'
import type { WebSearchMetadata, WebSearchResult } from '../../types/search'
import diagnosticLogger, { DiagnosticArea } from '@/lib/diagnosticLogger'

interface WebSearchBlockProps {
  content: string
  metadata?: WebSearchMetadata
  onCopy?: (content: string) => void
  isLoading?: boolean
}

export function WebSearchBlock({
  content,
  metadata,
  onCopy,
  isLoading = false
}: WebSearchBlockProps) {
  // Create unique component ID for tracing
  const componentId = useRef(`websearch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
  const COMPONENT_NAME = `WebSearchBlock:${componentId.current}`;
  
  // Capture initial render
  useEffect(() => {
    // Log the component initialization
    diagnosticLogger.info(
      DiagnosticArea.RENDER, 
      COMPONENT_NAME, 
      'Component mounted', 
      'WebSearchBlock component initialized',
      {
        contentLength: content?.length || 0,
        contentPreview: content ? content.substring(0, 100) + '...' : 'empty',
        hasMetadata: !!metadata,
        isLoading
      }
    );
    
    // Capture input content snapshot for diagnostics
    if (content) {
      const snapshotId = diagnosticLogger.captureSnapshot(
        DiagnosticArea.CONTENT,
        COMPONENT_NAME,
        { content, metadata },
        'Initial content and metadata'
      );
    }
    
    return () => {
      diagnosticLogger.info(
        DiagnosticArea.RENDER,
        COMPONENT_NAME,
        'Component unmounted',
        'WebSearchBlock component cleanup'
      );
    };
  }, []);

  const [copied, setCopied] = useState(false)
  const [hasError, setHasError] = useState(false)
  
  // Process content when component mounts or when it changes
  useEffect(() => {
    try {
      if (content && typeof content === 'string') {
        diagnosticLogger.debug(
          DiagnosticArea.CONTENT,
          COMPONENT_NAME,
          'Processing content',
          'Analyzing content format',
          { contentLength: content.length }
        );
        
        // Check for invalid content
        if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(content)) {
          setHasError(true);
          diagnosticLogger.warn(
            DiagnosticArea.CONTENT,
            COMPONENT_NAME,
            'Invalid characters',
            'Content contains invalid control characters',
            { firstInvalidAt: content.search(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/) }
          );
        } else {
          setHasError(false);
        }
        
        // Check for special formats - capture format type for diagnostics
        let formatType = 'unknown';
        
        if (content.includes("[WEB_SEARCH_RESULTS]") && 
            content.includes("[/WEB_SEARCH_RESULTS]")) {
          formatType = 'bracketed';
          diagnosticLogger.debug(
            DiagnosticArea.CONTENT,
            COMPONENT_NAME,
            'Format detection',
            'Detected bracketed web search results'
          );
        }
        // Special case check for raw search results content
        else if (content.includes("Search results for") && content.includes("URL:")) {
          formatType = 'raw';
          diagnosticLogger.debug(
            DiagnosticArea.CONTENT,
            COMPONENT_NAME,
            'Format detection',
            'Detected raw search result content'
          );
        }
        // Check for error messages related to content extraction
        else if (content.includes("Error fetching content:")) {
          formatType = 'error';
          diagnosticLogger.debug(
            DiagnosticArea.CONTENT,
            COMPONENT_NAME,
            'Format detection',
            'Detected content extraction error'
          );
        }
        
        // Log the detected format for diagnostics
        diagnosticLogger.info(
          DiagnosticArea.CONTENT,
          COMPONENT_NAME,
          'Format identification',
          `Content format identified as: ${formatType}`,
          { formatType, hasMetadata: !!metadata }
        );
      }
    } catch (e) {
      diagnosticLogger.error(
        DiagnosticArea.CONTENT,
        COMPONENT_NAME,
        'Processing error',
        'Exception during content processing',
        e,
        'WEB-SEARCH-PROC-01'
      );
      setHasError(true);
    }
  }, [content])
  
  const handleCopy = async () => {
    if (onCopy && content) {
      onCopy(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      diagnosticLogger.info(
        DiagnosticArea.RENDER, 
        COMPONENT_NAME, 
        'User interaction', 
        'Content copied to clipboard'
      );
    }
  }

  // Handle opening search in new tab
  const handleSearchInNewTab = () => {
    if (parsedMetadata?.query) {
      const encodedQuery = encodeURIComponent(parsedMetadata.query)
      window.open(`https://duckduckgo.com/?q=${encodedQuery}`, '_blank')
      diagnosticLogger.info(
        DiagnosticArea.RENDER, 
        COMPONENT_NAME, 
        'User interaction', 
        'Search opened in new tab', 
        { query: parsedMetadata.query }
      );
    }
  }

  // Helper function to extract search results from bracketed format
  const extractBracketedSearchResults = (text: string): WebSearchMetadata | null => {
    try {
      diagnosticLogger.debug(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Parse attempt',
        'Attempting to parse bracketed search results'
      );
      
      // Extract the content between [WEB_SEARCH_RESULTS] and [/WEB_SEARCH_RESULTS]
      const regex = /\[WEB_SEARCH_RESULTS\]([\s\S]*?)\[\/WEB_SEARCH_RESULTS\]/g;
      const matches = [...text.matchAll(regex)];
      
      if (matches.length === 0) {
        diagnosticLogger.debug(
          DiagnosticArea.PARSER,
          COMPONENT_NAME,
          'Parse notice',
          'No bracketed search results found in content'
        );
        return null;
      }
      
      // Process the first search result block
      const searchContent = matches[0][1].trim();
      
      // Log the extracted content for diagnostics
      diagnosticLogger.debug(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Content extraction',
        'Extracted search content from markers',
        { extractedLength: searchContent.length }
      );
      
      // Check if this is an error message
      const isErrorResult = searchContent.includes("Search encountered an error");
      
      // Extract query from the first line
      const queryMatch = searchContent.match(/Search results for ['"]([^'"]+)['"] from ([^:]+):/);
      
      if (!queryMatch && !isErrorResult) {
        diagnosticLogger.warn(
          DiagnosticArea.PARSER,
          COMPONENT_NAME,
          'Parse warning',
          'No query found in search results',
          { searchContentPreview: searchContent.substring(0, 100) },
          'SEARCH-QUERY-MISSING'
        );
        return null;
      }
      
      const query = queryMatch ? queryMatch[1] : "Search query";
      const engine = queryMatch ? queryMatch[2] : "Search Engine";
      
      // Handle error cases first
      if (isErrorResult) {
        const errorMatch = searchContent.match(/Search encountered an error: ([^\n]+)/);
        const errorMessage = errorMatch ? errorMatch[1] : "Unknown search error";
        
        diagnosticLogger.warn(
          DiagnosticArea.PARSER,
          COMPONENT_NAME,
          'Search error found',
          'Search result contains error message',
          { errorMessage, query }
        );
        
        return {
          query,
          engine,
          num_results: 0,
          results: [],
          errors: [errorMessage],
          hasMultipleSearches: matches.length > 1
        };
      }
      
      // Extract results using specialized pattern for your format
      const results: WebSearchResult[] = [];
      
      // First, find where the numbered results start - after the intro line
      const firstResultIndex = searchContent.indexOf("1.");
      if (firstResultIndex === -1) return null;
      
      // Extract just the results section
      const resultsSection = searchContent.substring(firstResultIndex);
      
      // Split by numbered items - this handles your format better
      const resultBlocks = resultsSection.split(/\s*\d+\.\s+/).filter(block => block.trim());
      
      for (const block of resultBlocks) {
        // Find the URL line
        const urlIndex = block.indexOf("URL:");
        if (urlIndex === -1) continue;
        
        // Split content and URL
        const content = block.substring(0, urlIndex).trim();
        const urlLine = block.substring(urlIndex).trim();
        const url = urlLine.replace(/^URL:\s*/, "").trim();
        
        // Get title from the first line of content
        const title = content.split('\n')[0].trim();
        
        results.push({
          title,
          content,
          url
        });
      }
      
      // If we didn't get any results through split approach, try regex
      if (results.length === 0) {
        // Pattern specific to the format in your example
        const exactPattern = /(\d+)\.\s+(.*?)(?:\s+URL:\s+(https?:\/\/[^\n]+))/gs;
        let match;
        
        while ((match = exactPattern.exec(searchContent)) !== null) {
          if (match[2] && match[3]) {
            const content = match[2].trim();
            const title = content.split('\n')[0].trim();
            let url = match[3].trim();
            
            // Handle the special duckduckgo URLs format
            if (url.includes('duckduckgo.com//duckduckgo.com/l')) {
              url = url.replace(/&rut=.*$/g, ''); // Clean up routing parameters
            }
            
            results.push({ title, content, url });
          }
        }
      }
      
      // If still no results, try line-by-line parsing as a last resort
      if (results.length === 0) {
        const lines = searchContent.split('\n');
        let currentTitle = '';
        let currentContent = '';
        let currentUrl = '';
        let collectingContent = false;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Check for the start of a result (matches number followed by a dot)
          if (/^\d+\./.test(line)) {
            // Save previous result if we have one
            if (currentTitle && currentUrl) {
              results.push({
                title: currentTitle,
                content: currentContent,
                url: currentUrl
              });
            }
            
            // Start new result
            currentTitle = line.replace(/^\d+\.\s*/, '').trim();
            currentContent = currentTitle;
            currentUrl = '';
            collectingContent = true;
          }
          // Check for URL line
          else if (line.startsWith('URL:') && collectingContent) {
            currentUrl = line.replace(/^URL:\s*/, '').trim();
            
            // Don't save here - wait until next result or end of processing
          }
          // Add to content if we're collecting and it's not a URL line
          else if (collectingContent) {
            currentContent += '\n' + line;
          }
        }
        
        // Add the last result
        if (currentTitle && currentUrl) {
          results.push({
            title: currentTitle,
            content: currentContent,
            url: currentUrl
          });
        }
      }
      
      // Check if we found multiple search blocks
      const hasMultipleSearches = matches.length > 1;
      
      // Extract titles from other search blocks if multiple
      const otherQueries: string[] = [];
      if (hasMultipleSearches) {
        for (let i = 1; i < matches.length; i++) {
          const otherContent = matches[i][1].trim();
          const otherQueryMatch = otherContent.match(/Search results for ['"]([^'"]+)['"]/);
          if (otherQueryMatch) {
            otherQueries.push(otherQueryMatch[1]);
          }
        }
      }
      
      // Log success of extraction
      diagnosticLogger.logTransformation(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Bracketed search extraction',
        { searchContent },
        { 
          query, 
          engine, 
          numResults: results.length, 
          hasMultipleSearches: matches.length > 1 
        },
        results.length > 0 // Success if we found results
      );
      
      return {
        query,
        engine,
        num_results: results.length,
        results,
        hasMultipleSearches,
        otherQueries
      };
    } catch (e) {
      diagnosticLogger.error(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Parse error',
        'Error extracting bracketed search results',
        e,
        'SEARCH-PARSE-ERR'
      );
      return null;
    }
  };
  
  // Helper function to extract query information from the text
  const extractQueryFromText = (text: string): string | null => {
    diagnosticLogger.debug(
      DiagnosticArea.PARSER,
      COMPONENT_NAME,
      'Query extraction',
      'Attempting to extract search query from text'
    );
    
    // Look for JSON query pattern with both single and double quotes
    const queryJsonMatch = text.match(/\{(?:"query"|'query'):\s*["']([^"']+)["']/);
    if (queryJsonMatch && queryJsonMatch[1]) {
      diagnosticLogger.debug(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Query found',
        'Found query in JSON format (type 1)',
        null,
        { query: queryJsonMatch[1] }
      );
      return queryJsonMatch[1];
    }
    
    // Try another JSON query pattern that might be in the text
    const alternateJsonMatch = text.match(/\{"query":\s*"([^"]+)"/);
    if (alternateJsonMatch && alternateJsonMatch[1]) {
      diagnosticLogger.debug(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Query found',
        'Found query in JSON format (type 2)',
        null,
        { query: alternateJsonMatch[1] }
      );
      return alternateJsonMatch[1];
    }
    
    // Look for "Search results for 'query'" pattern with both single and double quotes
    const searchForMatch = text.match(/Search results for ['"]([^'"]+)['"]/);
    if (searchForMatch && searchForMatch[1]) {
      diagnosticLogger.debug(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Query found',
        'Found query in search results text',
        null,
        { query: searchForMatch[1] }
      );
      return searchForMatch[1];
    }
    
    // Look for "I'll search for..." followed by a JSON object with query
    const searchIntroMatch = text.match(/I'll search for.*?\{.*?"query":\s*"([^"]+)"/);
    if (searchIntroMatch && searchIntroMatch[1]) {
      diagnosticLogger.debug(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Query found',
        'Found query in search introduction text',
        null,
        { query: searchIntroMatch[1] }
      );
      return searchIntroMatch[1];
    }
    
    diagnosticLogger.debug(
      DiagnosticArea.PARSER,
      COMPONENT_NAME,
      'Query missing',
      'No search query could be found in text'
    );
    return null;
  };

  // Parse metadata if it wasn't passed as an object
  let parsedMetadata: WebSearchMetadata | undefined = metadata as WebSearchMetadata;
  
  // Log the metadata state at the beginning
  diagnosticLogger.debug(
    DiagnosticArea.PARSER,
    COMPONENT_NAME,
    'Metadata parsing',
    'Starting metadata extraction process',
    { hasProvidedMetadata: !!metadata }
  );
  
  // First check if this is a bracketed search result - this should take precedence
  if (content && typeof content === 'string' && content.includes("[WEB_SEARCH_RESULTS]") && content.includes("[/WEB_SEARCH_RESULTS]")) {
    diagnosticLogger.debug(
      DiagnosticArea.PARSER,
      COMPONENT_NAME,
      'Parse strategy',
      'Using bracketed search result parser'
    );
    
    // Try to extract the bracketed content
    const extractedMetadata = extractBracketedSearchResults(content);
    
    if (extractedMetadata && extractedMetadata.results.length > 0) {
      parsedMetadata = extractedMetadata;
      
      diagnosticLogger.info(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Parse success',
        'Successfully extracted bracketed search results',
        null,
        { 
          query: extractedMetadata.query,
          numResults: extractedMetadata.results.length
        }
      );
    } else {
      diagnosticLogger.warn(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Parse warning',
        'Bracketed content found but extraction failed',
        { contentPreview: content.substring(0, 100) }
      );
    }
  }
  
  // If we don't have metadata yet, try other methods
  if (!parsedMetadata && content) {
      diagnosticLogger.debug(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Parse fallback',
        'No metadata from bracketed content, trying JSON parsing'
      );
      
      try {
        // Look for JSON objects in the text
        const jsonMatches = content.match(/(\{[^{]*(?:\{[^}]*\})*[^{]*\})/g);
        if (jsonMatches) {
          diagnosticLogger.debug(
            DiagnosticArea.PARSER,
            COMPONENT_NAME,
            'JSON detection',
            'Found potential JSON objects in content',
            { jsonMatchCount: jsonMatches.length }
          );
          
          // Try to parse each potential JSON object
          for (const jsonStr of jsonMatches) {
            try {
              const parsedContent = JSON.parse(jsonStr);
              
              if (parsedContent.action === 'web_search' || parsedContent.search_query || parsedContent.query || parsedContent.results) {
                diagnosticLogger.debug(
                  DiagnosticArea.PARSER,
                  COMPONENT_NAME,
                  'JSON parsing',
                  'Found valid search-related JSON object',
                  { jsonObject: jsonStr.substring(0, 100) + '...' }
                );
                
                parsedMetadata = {
                  query: parsedContent.search_query || parsedContent.query || '',
                  engine: parsedContent.engine || 'DuckDuckGo',
                  num_results: parsedContent.results?.length || 0,
                  results: []
                };
                
                // Process the results array
                if (Array.isArray(parsedContent.results)) {
                  // Format may vary - handle different structures
                  parsedMetadata.results = parsedContent.results.map((result: any) => {
                    // Ensure we have the expected structure
                    return {
                      title: result.title || 'Untitled',
                      content: result.content || result.snippet || result.description || '',
                      url: result.url || result.link || ''
                    };
                  });
                  
                  diagnosticLogger.info(
                    DiagnosticArea.PARSER,
                    COMPONENT_NAME,
                    'Results extraction',
                    'Successfully extracted results from JSON',
                    null,
                    { numResults: parsedMetadata.results.length }
                  );
                }
                
                break; // Stop after finding valid search metadata
              }
            } catch (e) {
              // Skip invalid JSON objects
              diagnosticLogger.trace(
                DiagnosticArea.PARSER,
                COMPONENT_NAME,
                'JSON parse error',
                'Error parsing potential JSON object',
                { jsonObject: jsonStr.substring(0, 50) + '...' }
              );
            }
          }
        }
        
        if (!parsedMetadata) {
          // Try to parse the entire content as JSON
          diagnosticLogger.debug(
            DiagnosticArea.PARSER,
            COMPONENT_NAME,
            'Parse attempt',
            'Attempting to parse entire content as JSON'
          );
          
          const parsedContent = JSON.parse(content);
          
          if (parsedContent.action === 'web_search' || parsedContent.search_query || parsedContent.query || parsedContent.results) {
            diagnosticLogger.debug(
              DiagnosticArea.PARSER,
              COMPONENT_NAME,
              'JSON parsing',
              'Found search metadata in complete JSON content'
            );
            
            parsedMetadata = {
              query: parsedContent.search_query || parsedContent.query || '',
              engine: parsedContent.engine || 'DuckDuckGo',
              num_results: parsedContent.results?.length || 0,
              results: []
            };
            
            // Process the results array
            if (Array.isArray(parsedContent.results)) {
              // Format may vary - handle different structures
              parsedMetadata.results = parsedContent.results.map((result: any) => {
                // Ensure we have the expected structure
                return {
                  title: result.title || 'Untitled',
                  content: result.content || result.snippet || result.description || '',
                  url: result.url || result.link || ''
                };
              });
              
              diagnosticLogger.info(
                DiagnosticArea.PARSER,
                COMPONENT_NAME,
                'Results extraction',
                'Successfully extracted results from complete JSON content',
                null,
                { numResults: parsedMetadata.results.length }
              );
            }
          }
        }
      } catch (e) {
        diagnosticLogger.info(
          DiagnosticArea.PARSER,
          COMPONENT_NAME,
          'JSON parse fallback',
          'JSON parsing failed, attempting text extraction',
          { error: e instanceof Error ? e.message : 'Unknown error' }
        );
        
        // If all JSON parsing fails, try to extract query from text
        const extractedQuery = extractQueryFromText(content);
        if (extractedQuery) {
          diagnosticLogger.info(
            DiagnosticArea.PARSER,
            COMPONENT_NAME,
            'Query extracted',
            'Successfully extracted query from text',
            null,
            { query: extractedQuery }
          );
          
          parsedMetadata = {
            query: extractedQuery,
            engine: 'Search Engine',
            num_results: 0,
            results: []
          };
        } else {
          diagnosticLogger.warn(
            DiagnosticArea.PARSER,
            COMPONENT_NAME,
            'Parsing failed',
            'All parsing methods failed to extract search metadata',
            { contentLength: content.length }
          );
        }
      }
    }
  

  // Check if we have actual search results to display
  let noResults = !parsedMetadata || !parsedMetadata.results || parsedMetadata.results.length === 0;
  
  // Log the metadata and rendering state
  useEffect(() => {
    diagnosticLogger.info(
      DiagnosticArea.RENDER,
      COMPONENT_NAME,
      'Render preparation',
      `${noResults ? 'No results available' : 'Search results available for rendering'}`,
      null,
      { 
        hasResults: !noResults,
        resultCount: parsedMetadata?.results?.length || 0,
        query: parsedMetadata?.query || 'none',
        hasMetadata: !!parsedMetadata
      }
    );
  }, [parsedMetadata, noResults]);
  
  // Extract error messages from content
  const extractErrorMessages = (text: string): string[] => {
    const errors: string[] = [];
    
    // Check for error messages in the specific format from your example
    if (text.includes("Error fetching content:")) {
      // Try line-by-line extraction first
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith("Error fetching content:")) {
          const errorMessage = line.trim().replace("Error fetching content:", "").trim();
          if (errorMessage) {
            errors.push(errorMessage);
          }
        }
      }
      
      // If no errors found with line-by-line, try regex
      if (errors.length === 0) {
        const errorRegex = /Error fetching content: ([^\n]+)/g;
        let match;
        
        while ((match = errorRegex.exec(text)) !== null) {
          errors.push(match[1]);
        }
      }
    }
    
    return errors;
  };
  
  // Extract raw search results from text
  const extractRawSearchResults = (text: string): WebSearchResult[] | null => {
    try {
      const results: WebSearchResult[] = [];
      
      // First, check if the text contains a common format pattern
      if (text.includes("Search results for") && text.includes("URL:")) {
        // Process the text line by line to identify and extract search results
        let searchLines = text.split('\n');
        for (let i = 0; i < searchLines.length; i++) {
          const line = searchLines[i].trim();
          
          // Check if this is the start of a result (matches number followed by a dot)
          if (/^\d+\./.test(line)) {
            const resultNumber = line.match(/^(\d+)\./)?.[1] || '';
            
            // Find the title and content - everything until the URL line
            let contentLines = [];
            let j = i;
            while (j < searchLines.length && !searchLines[j].trim().startsWith('URL:')) {
              // Skip the number prefix for the first line
              if (j === i) {
                contentLines.push(line.replace(/^\d+\.\s*/, ''));
              } else {
                contentLines.push(searchLines[j].trim());
              }
              j++;
            }
            
            // Check if we found a URL line
            if (j < searchLines.length && searchLines[j].trim().startsWith('URL:')) {
              const urlLine = searchLines[j].trim();
              const url = urlLine.replace(/^URL:\s*/, '').trim();
              
              // Clean content and create result
              const content = contentLines.join('\n').trim();
              const title = contentLines[0].trim() || `Result ${resultNumber}`;
              
              results.push({
                title,
                content,
                url
              });
              
              // Move ahead in the loop
              i = j;
            }
          }
        }
      }
      
      // If line-by-line approach didn't work, fall back to regex
      if (results.length === 0) {
        // Pattern to match the numbered results with URL in the exact format from your example
        const pattern = /\s*(\d+)\.\s+([\s\S]*?)(?:\s+URL:\s+(https?:\/\/[^\s\n]+))\s*(?=\s*\d+\.|$)/gs;
        let match;
        
        while ((match = pattern.exec(text)) !== null) {
          if (match[2] && match[3]) {
            // Clean up the URL (remove potential trailing spaces and quotes)
            let url = match[3].trim();
            // Handle the special duckduckgo URLs format
            if (url.includes('duckduckgo.com//duckduckgo.com/l')) {
              url = url.replace(/&rut=.*$/g, ''); // Clean up routing parameters
            }
            
            results.push({
              title: match[2].split('\n')[0].trim(), // Use first line as title
              content: match[2].trim(),
              url: url
            });
          }
        }
      }
      
      // If we still couldn't find results, try a more generic pattern
      if (results.length === 0) {
        const genericPattern = /(\d+)\.\s+(.*?)(?:\s+URL:\s+|link:\s+)(https?:\/\/[^\s\n]+)/gs;
        let match;
        
        while ((match = genericPattern.exec(text)) !== null) {
          if (match[2] && match[3]) {
            results.push({
              title: `Result ${match[1]}`,
              content: match[2].trim(),
              url: match[3].trim()
            });
          }
        }
      }
      
      return results.length > 0 ? results : null;
    } catch (e) {
      return null;
    }
  };

  // Function to extract JSON query objects
  const extractJsonQueries = (text: string): any[] => {
    const jsonObjects = [];
    
    // Look for patterns like {"query": "text"} or {"query":"text","num_results":5}
    const jsonRegex = /\{(?:[^{}]|"[^"]*")*"query"(?:[^{}]|"[^"]*")*\}/g;
    let match;
    
    while ((match = jsonRegex.exec(text)) !== null) {
      try {
        const jsonStr = match[0];
        const jsonObj = JSON.parse(jsonStr);
        if (jsonObj.query) {
          jsonObjects.push(jsonObj);
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }
    
    return jsonObjects;
  };

  // Look for any results in the parsedContent if we couldn't find them elsewhere
  if (noResults && typeof content === 'string') {
    // If content contains [WEB_SEARCH_RESULTS] try parsing it as bracketed format
    if (content.includes("[WEB_SEARCH_RESULTS]") && content.includes("[/WEB_SEARCH_RESULTS]")) {
      const bracketedResults = extractBracketedSearchResults(content);
      if (bracketedResults && bracketedResults.results.length > 0) {
        noResults = false;
        parsedMetadata = bracketedResults;
      }
    }
    
    // If still no results, try to find JSON query objects
    if (noResults) {
      const jsonQueries = extractJsonQueries(content);
      if (jsonQueries.length > 0) {
        // If we found JSON query objects but no results yet, try parsing as raw search text
        const rawResults = extractRawSearchResults(content);
        if (rawResults && rawResults.length > 0) {
          noResults = false;
          parsedMetadata = {
            query: jsonQueries[0].query || extractQueryFromText(content) || 'Unknown search',
            engine: 'Search Engine',
            num_results: rawResults.length,
            results: rawResults,
            hasMultipleSearches: jsonQueries.length > 1
          };
        }
      }
    }
    
    // If still no results, try to find structured JSON
    if (noResults) {
      try {
        // Find all potential JSON objects in the text
        const jsonPattern = /(\{[^{]*(?:\{[^}]*\})*[^{]*\})/g;
        const jsonMatches = content.match(jsonPattern);
        
        if (jsonMatches) {
          for (const jsonStr of jsonMatches) {
            try {
              const parsedObj = JSON.parse(jsonStr);
              
              // If we have an action object with results, use those
              if (parsedObj.action === 'web_search' && Array.isArray(parsedObj.results) && parsedObj.results.length > 0) {
                noResults = false;
                parsedMetadata = {
                  query: parsedObj.query || '',
                  engine: parsedObj.engine || 'search',
                  num_results: parsedObj.results.length,
                  results: parsedObj.results
                };
                break;
              }
              
              // Also check for objects with just 'query' and no results
              if (parsedObj.query && !parsedObj.results) {
                // Try to extract raw results from the text
                const rawResults = extractRawSearchResults(content);
                if (rawResults && rawResults.length > 0) {
                  noResults = false;
                  parsedMetadata = {
                    query: parsedObj.query,
                    engine: parsedObj.engine || 'Search Engine',
                    num_results: rawResults.length,
                    results: rawResults
                  };
                  break;
                }
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      } catch (e) {
        // Not JSON, try to extract raw results
        const rawResults = extractRawSearchResults(content);
        if (rawResults) {
          noResults = false;
          parsedMetadata = {
            query: extractQueryFromText(content) || 'Unknown search',
            engine: 'Search Engine',
            num_results: rawResults.length,
            results: rawResults
          };
        }
      }
    }
  }
  
  // Extract error messages if present
  const errorMessages = content ? extractErrorMessages(content) : [];
  
  // Check for valid URLs in results
  let allValidUrls = true;
  if (parsedMetadata?.results) {
    for (const result of parsedMetadata.results) {
      if (!result.url || !result.url.startsWith('http')) {
        allValidUrls = false;
        break;
      }
    }
  }

  // Special handling for bracketed search results
  if (content && typeof content === 'string' && content.includes("[WEB_SEARCH_RESULTS]") && content.includes("[/WEB_SEARCH_RESULTS]")) {
    // Extract bracketed content
    const regex = /\[WEB_SEARCH_RESULTS\]([\s\S]*?)\[\/WEB_SEARCH_RESULTS\]/;
    const match = content.match(regex);
    
    if (match && match[1]) {
      const searchContent = match[1].trim();
      
      // If we have search results and couldn't parse them earlier, do a more thorough job
      if (noResults && searchContent.includes("Search results for") && searchContent.includes("URL:")) {
        // Get query info
        const queryMatch = searchContent.match(/Search results for ['"]([^'"]+)['"] from ([^:]+):/);
        const query = queryMatch ? queryMatch[1] : "Search";
        const engine = queryMatch ? queryMatch[2] : "Search Engine";
        
        // Extract results using line-by-line approach
        const lines = searchContent.split('\n');
        const results: WebSearchResult[] = [];
        
        let currentTitle = '';
        let currentContent = '';
        let currentUrl = '';
        let collectingContent = false;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Check for the start of a result (numbered item)
          if (/^\d+\./.test(line)) {
            // Save previous result if we have one
            if (currentTitle && currentUrl) {
              results.push({
                title: currentTitle,
                content: currentContent,
                url: currentUrl
              });
            }
            
            // Start new result
            currentTitle = line.replace(/^\d+\.\s*/, '');
            currentContent = currentTitle;
            currentUrl = '';
            collectingContent = true;
          }
          // Check for URL line
          else if (line.startsWith('URL:') && collectingContent) {
            currentUrl = line.replace(/^URL:\s*/, '');
            // If we have a complete result, add it
            if (currentTitle) {
              results.push({
                title: currentTitle,
                content: currentContent,
                url: currentUrl
              });
              
              // Reset for the next result
              currentTitle = '';
              currentContent = '';
              currentUrl = '';
              collectingContent = false;
            }
          }
          // Add to content if we're collecting and it's not a URL line
          else if (collectingContent) {
            currentContent += '\n' + line;
          }
        }
        
        // Add the last result if we have one
        if (currentTitle && currentUrl) {
          results.push({
            title: currentTitle,
            content: currentContent,
            url: currentUrl
          });
        }
        
        // If we found results, use them
        if (results.length > 0) {
          noResults = false;
          parsedMetadata = {
            query,
            engine,
            num_results: results.length,
            results
          };
        }
      }
      
      // If we still couldn't parse the results, check if we at least have a query
      if (noResults && !parsedMetadata) {
        const queryMatch = searchContent.match(/Search results for ['"]([^'"]+)['"]/);
        if (queryMatch) {
          parsedMetadata = {
            query: queryMatch[1],
            engine: 'Search Engine',
            num_results: 0,
            results: []
          };
        }
      }
    }
  }
  
  // Last-ditch effort: if we still don't have results but have search-related content
  if (noResults && typeof content === 'string') {
    // Check for bracketed search results that need special handling
    if (content.includes("[WEB_SEARCH_RESULTS]") && content.includes("[/WEB_SEARCH_RESULTS]")) {
      // Extract the search content and format it as properly styled results
      const regex = /\[WEB_SEARCH_RESULTS\]([\s\S]*?)\[\/WEB_SEARCH_RESULTS\]/;
      const match = content.match(regex);
      
      if (match && match[1]) {
        const searchContent = match[1].trim();
        // Extract the query if possible
        const queryMatch = searchContent.match(/Search results for ['"]([^'"]+)['"]/);
        const query = queryMatch ? queryMatch[1] : "Search";
        
        // If it has a search error, show that nicely formatted
        if (searchContent.includes("Search encountered an error:")) {
          const errorMatch = searchContent.match(/Search encountered an error: ([^\n]+)/);
          const errorMessage = errorMatch ? errorMatch[1] : "Unknown search error";
          
          parsedMetadata = {
            query,
            engine: 'Search Engine',
            num_results: 0,
            results: [],
            errors: [errorMessage]
          };
          
          // Update noResults to show the error message
          noResults = false;
        } else {
          // Try once more with the raw content approach
          // Extract results with a last-ditch approach
          try {
            // Split content line by line and look for numbered results
            const lines = searchContent.split('\n');
            let inResult = false;
            let currentResult = '';
            const results: WebSearchResult[] = [];
            
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              
              // Start of a result (number followed by dot)
              if (/^\d+\./.test(line)) {
                if (inResult && currentResult) {
                  // Parse the result we were building and add it
                  const resultLines = currentResult.split('\n');
                  const title = resultLines[0].trim();
                  let content = '';
                  let url = '';
                  
                  for (let j = 0; j < resultLines.length; j++) {
                    if (resultLines[j].trim().startsWith('URL:')) {
                      url = resultLines[j].replace(/^URL:\s*/, '').trim();
                      break;
                    } else if (j > 0) {
                      content += resultLines[j] + '\n';
                    }
                  }
                  
                  if (title && url) {
                    results.push({
                      title,
                      content: content || title,
                      url
                    });
                  }
                }
                
                // Start new result
                inResult = true;
                currentResult = line.replace(/^\d+\.\s*/, '') + '\n';
              } else if (inResult) {
                // Continue building the current result
                currentResult += line + '\n';
              }
            }
            
            // Add the last result
            if (inResult && currentResult) {
              const resultLines = currentResult.split('\n');
              const title = resultLines[0].trim();
              let content = '';
              let url = '';
              
              for (let j = 0; j < resultLines.length; j++) {
                if (resultLines[j].trim().startsWith('URL:')) {
                  url = resultLines[j].replace(/^URL:\s*/, '').trim();
                  break;
                } else if (j > 0) {
                  content += resultLines[j] + '\n';
                }
              }
              
              if (title && url) {
                results.push({
                  title,
                  content: content || title,
                  url
                });
              }
            }
            
            if (results.length > 0) {
              parsedMetadata = {
                query,
                engine: 'Search Engine',
                num_results: results.length,
                results
              };
              noResults = false;
            } else {
              // Still no results, just show raw content
              return <span className="whitespace-pre-wrap break-words w-full overflow-hidden">{content}</span>;
            }
          } catch (e) {
            // If all parsing attempts fail, just show the original content
            return <span className="whitespace-pre-wrap break-words w-full overflow-hidden">{content}</span>;
          }
        }
      } else {
        // Couldn't extract the bracketed content, show as raw
        return <span className="whitespace-pre-wrap break-words w-full overflow-hidden">{content}</span>;
      }
    }
    // This is a non-bracketed search result with regular format
    else if (content.includes("Search results for") && content.includes("URL:")) {
      // Use line-by-line parsing as a last resort
      const lines = content.split('\n');
      const results: WebSearchResult[] = [];
      
      let currentTitle = '';
      let currentContent = '';
      let currentUrl = '';
      let collectingContent = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check for the start of a result (numbered item)
        if (/^\d+\./.test(line)) {
          // Save previous result if we have one
          if (currentTitle && currentUrl) {
            results.push({
              title: currentTitle,
              content: currentContent,
              url: currentUrl
            });
          }
          
          // Start new result
          currentTitle = line.replace(/^\d+\.\s*/, '');
          currentContent = currentTitle;
          currentUrl = '';
          collectingContent = true;
          continue;
        }
        
        // Check for URL line
        if (line.startsWith('URL:') && collectingContent) {
          currentUrl = line.replace(/^URL:\s*/, '');
          collectingContent = false;
          continue;
        }
        
        // Add to content if we're collecting and it's not a URL line
        if (collectingContent && !line.startsWith('URL:') && line.length > 0) {
          currentContent += '\n' + line;
        }
      }
      
      // Add the last result if we have one
      if (currentTitle && currentUrl) {
        results.push({
          title: currentTitle,
          content: currentContent,
          url: currentUrl
        });
      }
      
      // If we found results, use them
      if (results.length > 0) {
        parsedMetadata = {
          query: extractQueryFromText(content) || 'Search results',
          engine: 'Search Engine',
          num_results: results.length,
          results
        };
        
        // Update noResults flag
        noResults = false;
      } else {
        // If all parsing methods failed, just show the raw content
        return <span className="whitespace-pre-wrap break-words w-full overflow-hidden">{content}</span>;
      }
    }
  }
  
  // Extract text outside of search results
  const extractTextOutsideSearchResults = (text: string): string | null => {
    if (!text || !text.includes("[WEB_SEARCH_RESULTS]") || !text.includes("[/WEB_SEARCH_RESULTS]")) {
      return null;
    }
    
    // Get text before the first search block
    const beforeSearch = text.split("[WEB_SEARCH_RESULTS]")[0].trim();
    
    // Get text after the last search block
    const parts = text.split("[/WEB_SEARCH_RESULTS]");
    const afterSearch = parts[parts.length - 1].trim();
    
    // If there's text before or after, return it
    if (beforeSearch || afterSearch) {
      return (beforeSearch ? beforeSearch + "\n\n" : "") + 
             (afterSearch ? afterSearch : "");
    }
    
    return null;
  };

  // Get text outside search results
  const textOutsideSearch = extractTextOutsideSearchResults(content);
  
  // If there's text outside search results but no parsed metadata, show raw text
  if (textOutsideSearch && !parsedMetadata) {
    return (
      <div className="whitespace-pre-wrap break-words w-full overflow-hidden">
        {textOutsideSearch}
      </div>
    );
  }
  
  // If we have error messages, display them
  if (errorMessages.length > 0 && (!parsedMetadata || parsedMetadata.results?.length === 0)) {
    // If there's text outside search results, show it first
    const errorComponent = (
      <div className="relative group border border-amber-200 rounded-md overflow-hidden w-full max-w-full bg-amber-50">
        <div className="p-3 border-b border-amber-200 flex flex-wrap justify-between items-center bg-amber-100/50">
          <div className="min-w-0 flex-1 overflow-hidden mr-2">
            <span className="font-medium text-amber-800 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Content Extraction Error</span>
            </span>
            {parsedMetadata?.query && (
              <div className="text-xs text-amber-700 truncate">
                Query: "{parsedMetadata.query}"
              </div>
            )}
          </div>
          <button
            onClick={handleCopy}
            className="p-1 rounded-md text-amber-700 hover:text-amber-800 hover:bg-amber-200 flex-shrink-0"
            title="Copy to clipboard"
          >
            {copied ? 'Copied!' : <Copy className="h-4 w-4" />}
          </button>
        </div>
        
        <div className="p-4 bg-amber-50">
          <ul className="space-y-2">
            {errorMessages.map((error, index) => (
              <li key={index} className="text-amber-800 text-sm flex items-start">
                <AlertTriangle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                <span className="break-words">{error}</span>
              </li>
            ))}
          </ul>
          
          {parsedMetadata?.query && (
            <div className="mt-4 text-center">
              <button 
                onClick={handleSearchInNewTab}
                className="px-4 py-2 text-sm bg-amber-100 text-amber-800 rounded-md hover:bg-amber-200 inline-block max-w-full"
              >
                <span className="truncate block">Search for "{parsedMetadata.query}" on web</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
    
    if (textOutsideSearch) {
      return (
        <div className="space-y-4">
          <div className="whitespace-pre-wrap break-words w-full overflow-hidden">
            {textOutsideSearch}
          </div>
          {errorComponent}
        </div>
      );
    }
    
    return errorComponent;
  }
  
  if (noResults) {
    return (
      <div className="relative group border rounded-md overflow-hidden w-full max-w-full">
        <div className={`p-3 border-b flex flex-wrap justify-between items-center ${hasError ? 'bg-amber-50' : 'bg-indigo-50'}`}>
          <div className="min-w-0 flex-1 overflow-hidden mr-2">
            <span className={`font-medium ${hasError ? 'text-amber-700' : 'text-indigo-700'} flex items-center gap-1`}>
              {hasError && <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
              <span className="truncate">Web Search Results</span>
            </span>
            <div className="text-xs text-gray-500 truncate">
              {parsedMetadata?.query ? `Query: "${parsedMetadata.query}"` : 'No query specified'}
            </div>
          </div>
          <button
            onClick={handleCopy}
            className="p-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-200 flex-shrink-0"
            title="Copy to clipboard"
          >
            {copied ? 'Copied!' : <Copy className="h-4 w-4" />}
          </button>
        </div>
        
        <div className="p-4 bg-white">
          <div className="text-center py-6">
            <Search className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">No search results available</p>
            {parsedMetadata?.query && (
              <button 
                onClick={handleSearchInNewTab}
                className="mt-3 px-4 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 inline-block max-w-full"
              >
                <span className="truncate block">Search for "{parsedMetadata.query}" on web</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Display formatted search results
  return (
    <div className="relative group border rounded-md overflow-hidden w-full max-w-full">
      <div className={`p-3 border-b flex flex-wrap justify-between items-center ${hasError || errorMessages.length > 0 || (parsedMetadata.errors && parsedMetadata.errors.length > 0) ? 'bg-amber-50' : 'bg-indigo-50'}`}>
        <div className="min-w-0 flex-1 overflow-hidden mr-2">
          <span className={`font-medium ${hasError || errorMessages.length > 0 || (parsedMetadata.errors && parsedMetadata.errors.length > 0) ? 'text-amber-700' : 'text-indigo-700'} flex items-center gap-1 flex-wrap`}>
            {(hasError || errorMessages.length > 0 || (parsedMetadata.errors && parsedMetadata.errors.length > 0)) && (
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            )}
            <span className="truncate">Web Search Results</span>
          </span>
          <div className="text-xs text-gray-500 truncate">
            {parsedMetadata.query ? `Query: "${parsedMetadata.query}"` : ''}
            {parsedMetadata.engine ? ` • ${parsedMetadata.engine}` : ''}
            {parsedMetadata.num_results > 0 ? ` • ${parsedMetadata.num_results} results` : 
             parsedMetadata.errors?.length ? ' • Search error' : ''}
          </div>
          {/* Hide the "Also searched" section since we're now displaying separate blocks */}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {parsedMetadata.query && (
            <button
              onClick={handleSearchInNewTab}
              className="p-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-200 flex-shrink-0"
              title="Open search in browser"
            >
              <Search className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-200 flex-shrink-0"
            title="Copy to clipboard"
          >
            {copied ? 'Copied!' : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>
      
      <div className="p-2 bg-white divide-y divide-gray-100 w-full">
        {/* Display warnings, errors and search issues */}
        {(!allValidUrls || errorMessages.length > 0 || (parsedMetadata.errors && parsedMetadata.errors.length > 0)) && (
          <div className="space-y-2 mb-2 w-full overflow-hidden">
            {!allValidUrls && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-2 m-2 text-amber-800 text-xs overflow-hidden w-[calc(100%-16px)]">
                Warning: Some search results may contain invalid URLs
              </div>
            )}
            
            {/* Show content extraction errors */}
            {errorMessages.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-2 m-2 text-amber-800 text-xs overflow-hidden w-[calc(100%-16px)]">
                <div className="font-medium mb-1">Errors occurred during content extraction:</div>
                <ul className="space-y-1 pl-2 w-full">
                  {errorMessages.map((error, index) => (
                    <li key={index} className="flex items-start w-full">
                      <AlertTriangle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                      <span className="break-words overflow-hidden flex-1">{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Show search errors */}
            {parsedMetadata.errors && parsedMetadata.errors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-2 m-2 text-amber-800 text-xs overflow-hidden w-[calc(100%-16px)]">
                <div className="font-medium mb-1">Search errors:</div>
                <ul className="space-y-1 pl-2 w-full">
                  {parsedMetadata.errors.map((error, index) => (
                    <li key={index} className="flex items-start w-full">
                      <AlertTriangle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                      <span className="break-words overflow-hidden flex-1">{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        
        {/* We no longer need this warning since we display multiple search blocks separately */}
        
        {parsedMetadata.results.map((result: WebSearchResult, index: number) => {
          const isValidUrl = result.url && result.url.startsWith('http');
          
          return (
            <div key={index} className="py-3 px-2 hover:bg-gray-50 overflow-hidden w-full">
              {isValidUrl ? (
                <a 
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/result block overflow-hidden w-full"
                >
                  <div className="flex flex-wrap justify-between items-start w-full">
                    <h3 className="font-medium text-blue-600 group-hover/result:underline break-words mr-2 flex-1 max-w-[calc(100%-24px)]">
                      {result.title !== result.content ? result.title : (result.title.split('\n')[0] || 'Untitled')}
                    </h3>
                    <ExternalLink className="h-4 w-4 text-gray-400 group-hover/result:text-blue-600 flex-shrink-0 mt-1" />
                  </div>
                  <p className="text-sm text-gray-600 mt-1 break-words overflow-hidden whitespace-pre-line w-full">
                    {/* Format multiline content properly */}
                    {result.title !== result.content ? 
                      result.content :
                      result.content.split('\n').slice(1).join('\n')
                    }
                  </p>
                  <div className="text-xs text-green-700 mt-1 break-all overflow-hidden w-full">
                    {result.url}
                  </div>
                </a>
              ) : (
                // Display non-clickable result when URL is invalid
                <div className="block overflow-hidden w-full">
                  <div className="flex flex-wrap justify-between items-start w-full">
                    <h3 className="font-medium text-gray-700 break-words mr-2 flex-1">
                      {result.title !== result.content ? result.title : (result.title.split('\n')[0] || 'Untitled')}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 break-words overflow-hidden whitespace-pre-line w-full">
                    {/* Format multiline content properly */}
                    {result.title !== result.content ? 
                      result.content :
                      result.content.split('\n').slice(1).join('\n')
                    }
                  </p>
                  {result.url && (
                    <div className="text-xs text-gray-500 mt-1 break-all overflow-hidden w-full">
                      {result.url}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        
        {parsedMetadata.query && (
          <div className="pt-3 pb-2 px-2 text-center overflow-hidden w-full">
            <button 
              onClick={handleSearchInNewTab}
              className="px-4 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 inline-block max-w-[95%] overflow-hidden"
            >
              <span className="truncate block w-full">See more results for "{parsedMetadata.query}"</span>
            </button>
            
            {/* We no longer need other search query buttons since we display separate search blocks */}
          </div>
        )}
      </div>
    </div>
  );
}