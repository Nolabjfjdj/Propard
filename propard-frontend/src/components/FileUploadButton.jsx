import React, { useRef } from 'react';

export default function FileUploadButton({
  onFilesSelected,
  disabled = false,
  uploading = false,
  progress = 0
}) {
  const inputRef = useRef(null);

  const handleChange = event => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length) onFilesSelected(files);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        aria-label="Joindre des fichiers"
        title="Joindre des fichiers"
        style={styles.button}
      >
        {uploading ? progress + '%' : '📎'}
      </button>
    </>
  );
}

const styles = {
  button: {
    minWidth: 38,
    height: 38,
    border: '1px solid var(--border)',
    borderRadius: 10,
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    flexShrink: 0,
    fontSize: 16
  }
};
