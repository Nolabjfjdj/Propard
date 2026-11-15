import React from 'react';
import SafeLink from './SafeLink';

const URL_PATTERN = /https?:\/\/[^\s<>{}]+/gi;

export default function LinkText({ text = '' }) {
  const value = String(text);
  const parts = [];
  let last = 0;
  let match;
  let index = 0;
  while ((match = URL_PATTERN.exec(value))) {
    let url = match[0];
    let trailing = '';
    while (/[.,!?;:)]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    if (match.index > last) parts.push(value.slice(last, match.index));
    parts.push(<SafeLink key={'url-' + index++} href={url}>{url}</SafeLink>);
    if (trailing) parts.push(trailing);
    last = match.index + match[0].length;
  }
  if (last < value.length) parts.push(value.slice(last));
  return <>{parts}</>;
}
