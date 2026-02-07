import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Enter note in Markdown format...',
  minRows = 4,
  disabled = false,
  autoFocus = false,
}: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b bg-muted/50">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowPreview(false)}
          className={cn(
            'rounded-none border-b-2 border-transparent',
            !showPreview && 'border-primary bg-background'
          )}
        >
          Write
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowPreview(true)}
          className={cn(
            'rounded-none border-b-2 border-transparent',
            showPreview && 'border-primary bg-background'
          )}
        >
          Preview
        </Button>
      </div>

      {/* Content */}
      {showPreview ? (
        <div className="p-4 min-h-[120px] prose prose-sm max-w-none dark:prose-invert">
          {value ? (
            <ReactMarkdown
              allowedElements={[
                'p',
                'br',
                'strong',
                'em',
                'u',
                'code',
                'pre',
                'h1',
                'h2',
                'h3',
                'h4',
                'h5',
                'h6',
                'ul',
                'ol',
                'li',
                'blockquote',
                'a',
                'hr',
              ]}
              // Restrict URLs to safe protocols
              urlTransform={(url) => {
                if (
                  url.startsWith('http://') ||
                  url.startsWith('https://') ||
                  url.startsWith('/')
                ) {
                  return url;
                }
                return '#';
              }}
              components={{
                // Open external links in new tab
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target={href?.startsWith('http') ? '_blank' : undefined}
                    rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {value}
            </ReactMarkdown>
          ) : (
            <p className="text-muted-foreground italic">Nothing to preview</p>
          )}
        </div>
      ) : (
        <Textarea
          value={value}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className="border-0 rounded-none resize-y focus-visible:ring-0 focus-visible:ring-offset-0"
          style={{ minHeight: `${minRows * 24}px` }}
        />
      )}

      {/* Help text */}
      {!showPreview && (
        <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/50 border-t">
          Supports: **bold**, *italic*, `code`, [links](url), lists, headers, blockquotes
        </div>
      )}
    </div>
  );
}
