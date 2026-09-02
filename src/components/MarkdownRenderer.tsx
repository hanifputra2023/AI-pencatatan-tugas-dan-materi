import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, AppTheme } from '../contexts/ThemeContext';
import { copyToClipboard } from '../lib/clipboard';

interface MarkdownRendererProps {
  content: string;
  fontSize?: number;
  textColor?: string;
  style?: any;
}

import { cleanRawTextEntities, formatMathLatexToReadable } from '../lib/latexFormatter';


function MarkdownCodeBlock({
  code,
  lang,
  isLightMode,
}: {
  code: string;
  lang?: string;
  isLightMode: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <View
      style={[
        styles.codeBlock,
        {
          backgroundColor: isLightMode ? '#F8FAFC' : '#0F172A',
          borderColor: isLightMode ? '#E2E8F0' : '#334155',
        },
      ]}
    >
      <View
        style={[
          styles.codeHeader,
          { borderBottomColor: isLightMode ? '#E2E8F0' : '#1E293B' },
        ]}
      >
        <Text
          style={[
            styles.codeLangText,
            { color: isLightMode ? '#64748B' : '#94A3B8' },
          ]}
        >
          {(lang || 'CODE').toUpperCase()}
        </Text>
        <TouchableOpacity
          onPress={handleCopy}
          style={[
            styles.codeCopyBtn,
            { backgroundColor: isLightMode ? '#F1F5F9' : '#1E293B' },
            copied && { backgroundColor: isLightMode ? '#DCFCE7' : '#064E3B' },
          ]}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityLabel="Salin Kode"
        >
          <Ionicons
            name={copied ? 'checkmark-circle' : 'copy-outline'}
            size={12}
            color={copied ? '#16A34A' : isLightMode ? '#64748B' : '#94A3B8'}
          />
          <Text
            style={[
              styles.codeCopyBtnText,
              { color: copied ? '#16A34A' : isLightMode ? '#64748B' : '#94A3B8' },
            ]}
          >
            {copied ? 'Tersalin' : 'Salin'}
          </Text>
        </TouchableOpacity>
      </View>
      <Text
        style={[
          styles.codeBlockText,
          { color: isLightMode ? '#0369A1' : '#38BDF8' },
        ]}
        selectable
      >
        {code}
      </Text>
    </View>
  );
}

/**
 * Visual Markdown Table Component
 */
function MarkdownTable({
  headers,
  rows,
  theme,
  isLightMode,
}: {
  headers: string[];
  rows: string[][];
  theme: AppTheme;
  isLightMode: boolean;
}) {
  return (
    <View style={[styles.tableWrapper, { borderColor: isLightMode ? '#E2E8F0' : '#334155' }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={true} nestedScrollEnabled={true}>
        <View style={styles.tableInner}>
          {/* Header Row */}
          <View
            style={[
              styles.tableHeaderRow,
              {
                backgroundColor: isLightMode ? '#F1F5F9' : '#1E293B',
                borderBottomColor: isLightMode ? '#CBD5E1' : '#334155',
              },
            ]}
          >
            {headers.map((h, idx) => (
              <View key={`th-${idx}`} style={[styles.tableCell, { minWidth: 100 }]}>
                <Text
                  style={[
                    styles.tableHeaderText,
                    { color: isLightMode ? '#0F172A' : '#F8FAFC' },
                  ]}
                >
                  {h}
                </Text>
              </View>
            ))}
          </View>

          {/* Data Rows */}
          {rows.map((row, rIdx) => {
            const isEven = rIdx % 2 === 0;
            return (
              <View
                key={`tr-${rIdx}`}
                style={[
                  styles.tableDataRow,
                  {
                    backgroundColor: isEven
                      ? isLightMode
                        ? '#FFFFFF'
                        : '#0F172A'
                      : isLightMode
                      ? '#F8FAFC'
                      : '#131D31',
                    borderBottomColor: isLightMode ? '#E2E8F0' : '#233044',
                  },
                ]}
              >
                {row.map((cell, cIdx) => (
                  <View key={`td-${rIdx}-${cIdx}`} style={[styles.tableCell, { minWidth: 100 }]}>
                    <Text
                      style={[
                        styles.tableCellText,
                        { color: isLightMode ? '#334155' : '#E2E8F0' },
                      ]}
                    >
                      {cell}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Visual Timeline Component — menggantikan ASCII art |---| yang berantakan
 */
function MarkdownTimeline({
  points,
  theme,
  isLightMode,
}: {
  points: Array<{ year: string; label: string; sub?: string }>;
  theme: AppTheme;
  isLightMode: boolean;
}) {
  const lineColor = isLightMode ? '#CBD5E1' : '#334155';
  const dotColor = theme.primary;
  const yearColor = isLightMode ? '#1D4ED8' : '#93C5FD';
  const labelColor = isLightMode ? '#0F172A' : '#F1F5F9';
  const subColor = isLightMode ? '#64748B' : '#94A3B8';
  const bgColor = isLightMode ? '#F8FAFC' : '#0F172A';

  return (
    <View
      style={[
        styles.timelineWrapper,
        { backgroundColor: bgColor, borderColor: isLightMode ? '#E2E8F0' : '#334155' },
      ]}
    >
      {/* Garis horizontal */}
      <View style={[styles.timelineLine, { backgroundColor: lineColor }]} />

      {/* Titik & label */}
      <View style={styles.timelineRow}>
        {points.map((pt, idx) => (
          <View key={idx} style={styles.timelinePoint}>
            {/* Dot */}
            <View style={[styles.timelineDot, { backgroundColor: dotColor, borderColor: isLightMode ? '#FFFFFF' : '#0F172A' }]} />
            {/* Year */}
            <Text style={[styles.timelineYear, { color: yearColor }]}>{pt.year}</Text>
            {/* Label */}
            <Text style={[styles.timelineLabel, { color: labelColor }]} numberOfLines={3}>{pt.label}</Text>
            {/* Sub label */}
            {pt.sub ? (
              <Text style={[styles.timelineSub, { color: subColor }]} numberOfLines={2}>{pt.sub}</Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Callout / Alert Box Component
 */
function MarkdownCallout({
  type,
  content,
  theme,
  isLightMode,
  renderInline,
}: {
  type: 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';
  content: string;
  theme: AppTheme;
  isLightMode: boolean;
  renderInline: (text: string, style?: any) => React.ReactNode;
}) {
  const configs = {
    NOTE: {
      icon: 'information-circle' as const,
      color: '#3B82F6',
      bgLight: '#EFF6FF',
      bgDark: '#172554',
      title: 'Catatan',
    },
    TIP: {
      icon: 'bulb' as const,
      color: '#10B981',
      bgLight: '#ECFDF5',
      bgDark: '#064E3B',
      title: 'Tips',
    },
    IMPORTANT: {
      icon: 'star' as const,
      color: '#8B5CF6',
      bgLight: '#F5F3FF',
      bgDark: '#2E1065',
      title: 'Penting',
    },
    WARNING: {
      icon: 'warning' as const,
      color: '#F59E0B',
      bgLight: '#FFFBEB',
      bgDark: '#451A03',
      title: 'Peringatan',
    },
    CAUTION: {
      icon: 'alert-circle' as const,
      color: '#EF4444',
      bgLight: '#FEF2F2',
      bgDark: '#450A0A',
      title: 'Perhatian Khusus',
    },
  };

  const current = configs[type] || configs.NOTE;

  return (
    <View
      style={[
        styles.calloutBox,
        {
          backgroundColor: isLightMode ? current.bgLight : current.bgDark,
          borderColor: current.color,
        },
      ]}
    >
      <View style={styles.calloutHeader}>
        <Ionicons name={current.icon} size={16} color={current.color} />
        <Text style={[styles.calloutTitle, { color: current.color }]}>{current.title}</Text>
      </View>
      <Text style={[styles.calloutBody, { color: isLightMode ? '#1E293B' : '#F1F5F9' }]}>
        {renderInline(content)}
      </Text>
    </View>
  );
}

/**
 * Robust Multi-Pass Parser for Nested & Combined Inline Markdown
 */
function parseInlineSpans(
  rawText: string,
  theme: AppTheme,
  isLightMode: boolean,
  defaultTextColor: string,
  depth = 0
): React.ReactNode {
  if (!rawText) return null;
  if (depth > 4) return <Text style={{ color: defaultTextColor }}>{rawText}</Text>;

  // Tokenize regex for inline elements
  const tokenRegex = /(`[^`]+`|\*\*\*[^*]+\*\*\*|___[^_]+___|\*\*[^*]+\*\*|__[^_]+__|<u>.*?<\/u>|\*[^*]+\*|_[^_]+_|~~[^~]+~~)/g;

  const parts = rawText.split(tokenRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Inline Code
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const codeText = part.slice(1, -1);
      return (
        <Text
          key={index}
          style={[
            styles.inlineCode,
            {
              backgroundColor: isLightMode ? '#F1F5F9' : '#1E293B',
              borderColor: isLightMode ? '#CBD5E1' : '#334155',
              color: isLightMode ? '#0284C7' : '#38BDF8',
            },
          ]}
        >
          {codeText}
        </Text>
      );
    }

    // Bold + Italic (***text*** or ___text___)
    if ((part.startsWith('***') && part.endsWith('***')) || (part.startsWith('___') && part.endsWith('___'))) {
      const inner = part.slice(3, -3);
      return (
        <Text key={index} style={[styles.bold, styles.italic, { color: defaultTextColor }]}>
          {parseInlineSpans(inner, theme, isLightMode, defaultTextColor, depth + 1)}
        </Text>
      );
    }

    // Bold (**text**)
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <Text key={index} style={[styles.bold, { color: defaultTextColor }]}>
          {parseInlineSpans(inner, theme, isLightMode, defaultTextColor, depth + 1)}
        </Text>
      );
    }

    // Underline (__text__ or <u>text</u>)
    if (part.startsWith('__') && part.endsWith('__') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <Text key={index} style={[styles.underline, { color: defaultTextColor }]}>
          {parseInlineSpans(inner, theme, isLightMode, defaultTextColor, depth + 1)}
        </Text>
      );
    }
    if (part.startsWith('<u>') && part.endsWith('</u>')) {
      const inner = part.slice(3, -4);
      return (
        <Text key={index} style={[styles.underline, { color: defaultTextColor }]}>
          {parseInlineSpans(inner, theme, isLightMode, defaultTextColor, depth + 1)}
        </Text>
      );
    }

    // Italic (*text* or _text_)
    if ((part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
        (part.startsWith('_') && part.endsWith('_') && part.length >= 2)) {
      const inner = part.slice(1, -1);
      return (
        <Text key={index} style={[styles.italic, { color: defaultTextColor }]}>
          {parseInlineSpans(inner, theme, isLightMode, defaultTextColor, depth + 1)}
        </Text>
      );
    }

    // Strikethrough (~~text~~)
    if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <Text key={index} style={[styles.strikethrough, { color: theme.muted }]}>
          {parseInlineSpans(inner, theme, isLightMode, defaultTextColor, depth + 1)}
        </Text>
      );
    }

    // Regular Plain Text
    return (
      <Text key={index} style={{ color: defaultTextColor }}>
        {part}
      </Text>
    );
  });
}

export default function MarkdownRenderer({
  content,
  fontSize = 15,
  textColor,
  style,
}: MarkdownRendererProps) {
  const { theme, isLightMode } = useTheme();
  if (!content) return null;

  // Clean raw entities and format math LaTeX to Unicode
  const cleanedContent = formatMathLatexToReadable(cleanRawTextEntities(content));
  const effectiveTextColor = textColor || theme.text;
  const lines = cleanedContent.split('\n');
  const renderedElements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockBuffer: string[] = [];
  let codeBlockLang = '';

  const renderInline = (text: string, customStyle?: any) => {
    return (
      <Text style={customStyle}>
        {parseInlineSpans(text, theme, isLightMode, effectiveTextColor)}
      </Text>
    );
  };

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmedLine = rawLine.trim();

    // 1. Code block toggles ```
    if (trimmedLine.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        renderedElements.push(
          <MarkdownCodeBlock
            key={`code-${i}`}
            code={codeBlockBuffer.join('\n')}
            lang={codeBlockLang}
            isLightMode={isLightMode}
          />
        );
        inCodeBlock = false;
        codeBlockBuffer = [];
        codeBlockLang = '';
      } else {
        // Start code block
        inCodeBlock = true;
        codeBlockLang = trimmedLine.replace(/```/g, '').trim();
      }
      i++;
      continue;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(rawLine);
      i++;
      continue;
    }

    // 2. Table Parser: checks if current line and next line form a markdown table
    if (
      trimmedLine.startsWith('|') &&
      trimmedLine.endsWith('|') &&
      i + 1 < lines.length &&
      lines[i + 1].trim().startsWith('|') &&
      /^[|\s-:]+$/.test(lines[i + 1].trim())
    ) {
      // Parse Table Header
      const headerCells = trimmedLine
        .split('|')
        .slice(1, -1)
        .map(c => c.trim());

      i += 2; // skip header and delimiter lines
      const tableRows: string[][] = [];

      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const rowCells = lines[i]
          .trim()
          .split('|')
          .slice(1, -1)
          .map(c => c.trim());
        tableRows.push(rowCells);
        i++;
      }

      renderedElements.push(
        <MarkdownTable
          key={`table-${i}`}
          headers={headerCells}
          rows={tableRows}
          theme={theme}
          isLightMode={isLightMode}
        />
      );
      continue;
    }

    // 3. GitHub-style Alert Callouts (> [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION])
    const calloutMatch = trimmedLine.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
    if (calloutMatch) {
      const type = calloutMatch[1].toUpperCase() as 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';
      let calloutText = calloutMatch[2] || '';
      i++;
      // Collect succeeding quote lines
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        const nextQuote = lines[i].trim().replace(/^>\s*/, '');
        calloutText += (calloutText ? '\n' : '') + nextQuote;
        i++;
      }

      renderedElements.push(
        <MarkdownCallout
          key={`callout-${i}`}
          type={type}
          content={calloutText}
          theme={theme}
          isLightMode={isLightMode}
          renderInline={renderInline}
        />
      );
      continue;
    }

    // 4a. ASCII Timeline Detection
    // Deteksi 2–4 baris berurutan yang membentuk pola timeline ASCII:
    // Baris 1: angka tahun/label epoch (misal "1760   1970   2020")
    // Baris 2: garis connector |----|
    // Baris 3: label peristiwa
    // Baris 4 (opsional): sub-label dalam kurung
    const isYearLine = (l: string) => /^\s*(\d{3,4}|\w[\w\s]*)(\s{2,}(\d{3,4}|\w[\w\s]*))+\s*$/.test(l);
    const isConnectorLine = (l: string) => /^[\s|\-=+.]{4,}$/.test(l) && l.includes('-') && l.includes('|');
    const isLabelLine = (l: string) => !!l.trim() && !isYearLine(l) && !isConnectorLine(l) && !l.trim().startsWith('#') && !l.trim().startsWith('|');

    if (
      isYearLine(trimmedLine) &&
      i + 1 < lines.length && isConnectorLine(lines[i + 1]) &&
      i + 2 < lines.length && isLabelLine(lines[i + 2])
    ) {
      // Ekstrak token dari baris tahun berdasarkan spasi ganda sebagai separator
      const yearTokens = trimmedLine.trim().split(/\s{2,}/).map(t => t.trim()).filter(Boolean);
      const labelLine = lines[i + 2];
      // Coba split label di posisi yang sama dengan tahun via spasi ganda
      const labelTokens = labelLine.trim().split(/\s{2,}/).map(t => t.trim()).filter(Boolean);
      // Baris sub opsional
      let subTokens: string[] = [];
      let skip = 3;
      if (i + 3 < lines.length) {
        const possibleSub = lines[i + 3];
        if (isLabelLine(possibleSub) && possibleSub.includes('(') && possibleSub.includes(')')) {
          subTokens = possibleSub.trim().split(/\)\s*\(|\)\s{2,}|\s{2,}/).map(t => t.replace(/[()]/g, '').trim()).filter(Boolean);
          skip = 4;
        }
      }

      const points = yearTokens.map((year, idx) => ({
        year,
        label: labelTokens[idx] || '',
        sub: subTokens[idx] || undefined,
      }));

      renderedElements.push(
        <MarkdownTimeline
          key={`timeline-${i}`}
          points={points}
          theme={theme}
          isLightMode={isLightMode}
        />
      );
      i += skip;
      continue;
    }

    // 4b. Horizontal rule (--- or *** or ___)
    if (/^[-*_]{3,}$/.test(trimmedLine)) {
      renderedElements.push(
        <View key={`hr-${i}`} style={[styles.hr, { backgroundColor: theme.border }]} />
      );
      i++;
      continue;
    }

    // 5. Headings (# H1, ## H2, ### H3, #### H4)
    if (/^#\s+/.test(trimmedLine)) {
      const headingText = trimmedLine.replace(/^#\s+/, '');
      renderedElements.push(
        <Text key={`h1-${i}`} style={[styles.h1, { color: effectiveTextColor }]}>
          {renderInline(headingText)}
        </Text>
      );
      i++;
      continue;
    }
    if (/^##\s+/.test(trimmedLine)) {
      const headingText = trimmedLine.replace(/^##\s+/, '');
      renderedElements.push(
        <Text
          key={`h2-${i}`}
          style={[styles.h2, { color: isLightMode ? '#1D4ED8' : '#93C5FD' }]}
        >
          {renderInline(headingText)}
        </Text>
      );
      i++;
      continue;
    }
    if (/^###\s+/.test(trimmedLine)) {
      const headingText = trimmedLine.replace(/^###\s+/, '');
      renderedElements.push(
        <Text
          key={`h3-${i}`}
          style={[styles.h3, { color: isLightMode ? '#2563EB' : '#60A5FA' }]}
        >
          {renderInline(headingText)}
        </Text>
      );
      i++;
      continue;
    }
    if (/^####\s+/.test(trimmedLine)) {
      const headingText = trimmedLine.replace(/^####\s+/, '');
      renderedElements.push(
        <Text
          key={`h4-${i}`}
          style={[styles.h4, { color: isLightMode ? '#4F46E5' : '#A5B4FC' }]}
        >
          {renderInline(headingText)}
        </Text>
      );
      i++;
      continue;
    }

    // 6. Regular Blockquotes (> ...)
    if (trimmedLine.startsWith('>')) {
      const quoteText = trimmedLine.replace(/^>\s*/, '');
      renderedElements.push(
        <View
          key={`quote-${i}`}
          style={[
            styles.blockquote,
            {
              backgroundColor: isLightMode ? '#F8FAFC' : '#1E293B',
              borderLeftColor: theme.primary,
            },
          ]}
        >
          <Text
            style={[
              styles.blockquoteText,
              { fontSize, color: isLightMode ? '#475569' : '#D1D5DB' },
            ]}
          >
            {renderInline(quoteText)}
          </Text>
        </View>
      );
      i++;
      continue;
    }

    // 7. Unordered list (- or * or •) with indent detection
    const ulMatch = rawLine.match(/^(\s*)([-*•])\s+(.*)$/);
    if (ulMatch) {
      const indentLevel = Math.min(Math.floor(ulMatch[1].length / 2), 3);
      renderedElements.push(
        <View key={`ul-${i}`} style={[styles.listItemRow, { paddingLeft: 4 + indentLevel * 14 }]}>
          <Text style={[styles.bulletDot, { color: indentLevel > 0 ? theme.subtext : theme.accentLight }]}>
            {indentLevel > 0 ? '◦' : '•'}
          </Text>
          <Text
            style={[
              styles.listText,
              { fontSize, lineHeight: fontSize + 8, color: effectiveTextColor },
            ]}
          >
            {renderInline(ulMatch[3])}
          </Text>
        </View>
      );
      i++;
      continue;
    }

    // 8. Ordered list (1. , 2. )
    const olMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (olMatch) {
      const indentLevel = Math.min(Math.floor(olMatch[1].length / 2), 3);
      renderedElements.push(
        <View key={`ol-${i}`} style={[styles.listItemRow, { paddingLeft: 4 + indentLevel * 14 }]}>
          <Text style={[styles.orderedNum, { color: theme.accentLight }]}>{olMatch[2]}.</Text>
          <Text
            style={[
              styles.listText,
              { fontSize, lineHeight: fontSize + 8, color: effectiveTextColor },
            ]}
          >
            {renderInline(olMatch[3])}
          </Text>
        </View>
      );
      i++;
      continue;
    }

    // 9. Empty line spacing
    if (!trimmedLine) {
      renderedElements.push(<View key={`empty-${i}`} style={{ height: 10 }} />);
      i++;
      continue;
    }

    // 10. Normal paragraph
    renderedElements.push(
      <Text
        key={`p-${i}`}
        style={[styles.paragraph, { fontSize, lineHeight: fontSize + 8, color: effectiveTextColor }]}
      >
        {renderInline(rawLine)}
      </Text>
    );
    i++;
  }

  // Handle unclosed code block at end of content
  if (inCodeBlock && codeBlockBuffer.length > 0) {
    renderedElements.push(
      <MarkdownCodeBlock
        key="code-unclosed"
        code={codeBlockBuffer.join('\n')}
        lang={codeBlockLang}
        isLightMode={isLightMode}
      />
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
  },
  italic: {
    fontStyle: 'italic',
  },
  underline: {
    textDecorationLine: 'underline',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
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
    marginRight: 8,
    lineHeight: 22,
  },
  orderedNum: {
    fontSize: 13,
    fontWeight: '700',
    marginRight: 8,
    lineHeight: 22,
    minWidth: 20,
  },
  listText: {
    flex: 1,
  },
  codeBlock: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
    overflow: 'hidden',
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingBottom: 6,
    marginBottom: 8,
  },
  codeLangText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  codeCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  codeCopyBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  codeBlockText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  inlineCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  hr: {
    height: 1,
    marginVertical: 16,
  },
  tableWrapper: {
    borderWidth: 1,
    borderRadius: 8,
    marginVertical: 10,
    overflow: 'hidden',
  },
  tableInner: {
    minWidth: '100%',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tableCell: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  tableHeaderText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tableCellText: {
    fontSize: 13,
    lineHeight: 18,
  },
  calloutBox: {
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  calloutTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  calloutBody: {
    fontSize: 14,
    lineHeight: 22,
  },
  timelineWrapper: {
    borderWidth: 1,
    borderRadius: 12,
    marginVertical: 12,
    paddingVertical: 20,
    paddingHorizontal: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    height: 2,
    left: 28,
    right: 28,
    top: 32,
    borderRadius: 1,
  },
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  timelinePoint: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 4,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    marginBottom: 4,
    zIndex: 1,
  },
  timelineYear: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  timelineLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 2,
  },
  timelineSub: {
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 14,
  },
});
