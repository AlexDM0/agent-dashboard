import Markdown, { type Components } from 'react-markdown';
import remarkGfm                     from 'remark-gfm';

/** No `rehype-raw`: react-markdown turns raw HTML into text nodes, so nothing a session writes is read as markup. */
const MARKDOWN_COMPONENTS: Components = {
  a:   ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  img: ({ alt }) => <span className="ap-markdown-image">{alt}</span>,
};

const REMARK_PLUGINS = [remarkGfm];

export function MarkdownText({ text }: { text: string }) {
  return (
    <div className="ap-turn-text ap-markdown">
      <Markdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>{text}</Markdown>
    </div>
  );
}
