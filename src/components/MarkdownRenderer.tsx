import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

interface MarkdownRendererProps {
  content: string;
  fontSize?: number;
  textColor?: string;
  style?: any;
}

interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  code?: boolean;
}

/**
 * Robust Multi-Pass Parser for Nested & Combined Inline Markdown
 */
function parseInlineSpans(rawText: string, depth = 0): React.ReactNode {
  if (!rawText) return null;
  if (depth > 4) return <Text>{rawText}</Text>;

  // Tokenize regex for inline elements
  const tokenRegex = /(`[^`]+`|\*\*\*[^*]+\*\*\*|___[^_]+___|\*\*[^*]+\*\*|__[^_]+__|<u>.*?<\/u>|\*[^*]+\*|_[^_]+_|~~[^~]+~~)/g;

  const parts = rawText.split(tokenRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Inline Code
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const codeText = part.slice(1, -1);
      return (
        <Text key={index} style={styles.inlineCode}>
          {codeText}
        </Text>
      );
    }

    // Bold + Italic (***text*** or ___text___)
    if ((part.startsWith('***') && part.endsWith('***')) || (part.startsWith('___') && part.endsWith('___'))) {
      const inner = part.slice(3, -3);
      return (
        <Text key={index} style={[styles.bold, styles.italic]}>
          {parseInlineSpans(inner, depth + 1)}
        </Text>
      );
    }

    // Bold (**text**)
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <Text key={index} style={styles.bold}>
          {parseInlineSpans(inner, depth + 1)}
        </Text>
      );
    }

    // Underline (__text__ or <u>text</u>)
    if (part.startsWith('__') && part.endsWith('__') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <Text key={index} style={styles.underline}>
          {parseInlineSpans(inner, depth + 1)}
        </Text>
      );
    }
    if (part.startsWith('<u>') && part.endsWith('</u>')) {
      const inner = part.slice(3, -4);
      return (
        <Text key={index} style={styles.underline}>
          {parseInlineSpans(inner, depth + 1)}
        </Text>
      );
    }

    // Italic (*text* or _text_)
    if ((part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
        (part.startsWith('_') && part.endsWith('_') && part.length >= 2)) {
      const inner = part.slice(1, -1);
      return (
        <Text key={index} style={styles.italic}>
          {parseInlineSpans(inner, depth + 1)}
        </Text>
      );
    }

    // Strikethrough (~~text~~)
    if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <Text key={index} style={styles.strikethrough}>
          {parseInlineSpans(inner, depth + 1)}
        </Text>
      );
    }

    // Regular Plain Text
    return <Text key={index}>{part}</Text>;
  });
}

export default function MarkdownRenderer({
  content,
  fontSize = 15,
  textColor = '#E5E7EB',
  style,
}: MarkdownRendererProps) {
  if (!content) return null;

  const lines = content.split('\n');
  const renderedElements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockBuffer: string[] = [];
  let codeBlockLang = '';

  const renderInline = (text: string, customStyle?: any) => {
    return (
      <Text style={customStyle}>
        {parseInlineSpans(text)}
      </Text>
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmedLine = rawLine.trim();

    // 1. Code block toggles ```
    if (trimmedLine.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        renderedElements.push(
          <View key={`code-${i}`} style={styles.codeBlock}>
            {codeBlockLang ? (
              <View style={styles.codeHeader}>
                <Text style={styles.codeLangText}>{codeBlockLang.toUpperCase()}</Text>
              </View>
            ) : null}
            <Text style={styles.codeBlockText}>{codeBlockBuffer.join('\n')}</Text>
          </View>
        );
        inCodeBlock = false;
        codeBlockBuffer = [];
        codeBlockLang = '';
      } else {
        // Start code block
        inCodeBlock = true;
        codeBlockLang = trimmedLine.replace(/```/g, '').trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(rawLine);
      continue;
    }

    // 2. Horizontal rule (--- or *** or ___)
    if (/^[-*_]{3,}$/.test(trimmedLine)) {
      renderedElements.push(<View key={`hr-${i}`} style={styles.hr} />);
      continue;
    }

    // 3. Headings (# H1, ## H2, ### H3, #### H4)
    if (/^#\s+/.test(trimmedLine)) {
      const headingText = trimmedLine.replace(/^#\s+/, '');
      renderedElements.push(
        <Text key={`h1-${i}`} style={[styles.h1, { color: textColor }]}>
          {renderInline(headingText)}
        </Text>
      );
      continue;
    }
    if (/^##\s+/.test(trimmedLine)) {
      const headingText = trimmedLine.replace(/^##\s+/, '');
      renderedElements.push(
        <Text key={`h2-${i}`} style={[styles.h2, { color: '#93C5FD' }]}>
          {renderInline(headingText)}
        </Text>
      );
      continue;
    }
    if (/^###\s+/.test(trimmedLine)) {
      const headingText = trimmedLine.replace(/^###\s+/, '');
      renderedElements.push(
        <Text key={`h3-${i}`} style={[styles.h3, { color: '#60A5FA' }]}>
          {renderInline(headingText)}
        </Text>
      );
      continue;
    }
    if (/^####\s+/.test(trimmedLine)) {
      const headingText = trimmedLine.replace(/^####\s+/, '');
      renderedElements.push(
        <Text key={`h4-${i}`} style={[styles.h4, { color: '#A5B4FC' }]}>
          {renderInline(headingText)}
        </Text>
      );
      continue;
    }

    // 4. Blockquotes (> ...)
    if (trimmedLine.startsWith('>')) {
      const quoteText = trimmedLine.replace(/^>\s*/, '');
      renderedElements.push(
        <View key={`quote-${i}`} style={styles.blockquote}>
          <Text style={[styles.blockquoteText, { fontSize, color: '#D1D5DB' }]}>
            {renderInline(quoteText)}
          </Text>
        </View>
      );
      continue;
    }

    // 5. Unordered list (- or * or •)
    const ulMatch = trimmedLine.match(/^[-*•]\s+(.*)$/);
    if (ulMatch) {
      renderedElements.push(
        <View key={`ul-${i}`} style={styles.listItemRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={[styles.listText, { fontSize, lineHeight: fontSize + 8, color: textColor }]}>
            {renderInline(ulMatch[1])}
          </Text>
        </View>
      );
      continue;
    }

    // 6. Ordered list (1. , 2. )
    const olMatch = trimmedLine.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      renderedElements.push(
        <View key={`ol-${i}`} style={styles.listItemRow}>
          <Text style={styles.orderedNum}>{olMatch[1]}.</Text>
          <Text style={[styles.listText, { fontSize, lineHeight: fontSize + 8, color: textColor }]}>
            {renderInline(olMatch[2])}
          </Text>
        </View>
      );
      continue;
    }

    // 7. Empty line spacing
    if (!trimmedLine) {
      renderedElements.push(<View key={`empty-${i}`} style={{ height: 10 }} />);
      continue;
    }

    // 8. Normal paragraph
    renderedElements.push(
      <Text
        key={`p-${i}`}
        style={[styles.paragraph, { fontSize, lineHeight: fontSize + 8, color: textColor }]}
      >
        {renderInline(rawLine)}
      </Text>
    );
  }

  // Handle unclosed code block at end of content
  if (inCodeBlock && codeBlockBuffer.length > 0) {
    renderedElements.push(
      <View key="code-unclosed" style={styles.codeBlock}>
        <Text style={styles.codeBlockText}>{codeBlockBuffer.join('\n')}</Text>
      </View>
    );
  }

  return <View style={[styles.container, style]}>{renderedElements}</View>;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  paragraph: {
    marginBottom: 8,
    fontWeight: '400',
  },
  bold: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  italic: {
    fontStyle: 'italic',
  },
  underline: {
    textDecorationLine: 'underline',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  h1: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  h2: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  h3: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 6,
  },
  h4: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  blockquote: {
    borderLeftWidth: 3.5,
    borderLeftColor: '#3B82F6',
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
    marginVertical: 8,
  },
  blockquoteText: {
    fontStyle: 'italic',
    lineHeight: 22,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 3,
    paddingLeft: 4,
  },
  bulletDot: {
    fontSize: 16,
    color: '#60A5FA',
    marginRight: 8,
    lineHeight: 22,
  },
  orderedNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#60A5FA',
    marginRight: 8,
    lineHeight: 22,
    minWidth: 20,
  },
  listText: {
    flex: 1,
  },
  codeBlock: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
    overflow: 'hidden',
  },
  codeHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingBottom: 6,
    marginBottom: 8,
  },
  codeLangText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  codeBlockText: {
    color: '#38BDF8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  inlineCode: {
    backgroundColor: '#1E293B',
    color: '#38BDF8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  hr: {
    height: 1,
    backgroundColor: '#374151',
    marginVertical: 16,
  },
});
