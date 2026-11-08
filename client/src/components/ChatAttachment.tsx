import { useEffect, useState } from 'react';
import { Button, Toast } from '@douyinfe/semi-ui';
import { IconDownload, IconFile } from '@douyinfe/semi-icons';
import { downloadFile, formatBytes, saveBlob } from '../files';
import type { ChatAttachmentInfo } from '../chatAttach';

interface Props {
  att: ChatAttachmentInfo;
  /** 会话文件令牌，取字节要用；没连上时为空串。 */
  token: string;
}

/** 聊天里的一条附件：图片给缩略预览，其它文件给文件卡片，都能下载。 */
export default function ChatAttachment({ att, token }: Props) {
  const isImage = att.kind === 'image';
  const [url, setUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isImage || !token) {
      setPhase('ready');
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setPhase('loading');
    setError('');
    downloadFile({ token, cid: att.cid, path: att.path, expectedSize: att.size })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setPhase('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [att.cid, att.path, att.size, isImage, token]);

  const download = async () => {
    if (!token) {
      Toast.error('还没连上服务器，暂时无法下载');
      return;
    }
    try {
      const blob = await downloadFile({ token, cid: att.cid, path: att.path, expectedSize: att.size });
      saveBlob(blob, att.name);
    } catch (e: unknown) {
      Toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const dlButton = (
    <Button
      className="sh-attach-dl btn-semi"
      htmlType="button"
      size="small"
      icon={<IconDownload />}
      onClick={() => void download()}
    >
      下载
    </Button>
  );

  if (isImage) {
    return (
      <div className="sh-attach-img">
        {phase === 'loading' && <div className="sh-attach-ph">图片加载中…</div>}
        {phase === 'error' && <div className="sh-attach-ph sh-attach-err">图片加载失败：{error}</div>}
        {url && (
          <img
            className="sh-attach-img-el"
            src={url}
            alt={att.name}
            title={`${att.name} · ${formatBytes(att.size)}（点击查看原图）`}
            onClick={() => window.open(url, '_blank')}
          />
        )}
        <div className="sh-attach-foot">
          <span className="sh-attach-name" title={att.name}>
            {att.name}
          </span>
          <span className="sh-attach-size">{formatBytes(att.size)}</span>
          {dlButton}
        </div>
      </div>
    );
  }

  return (
    <div className="sh-attach-file">
      <span className="sh-attach-ico">
        <IconFile size="large" />
      </span>
      <span className="sh-attach-info">
        <span className="sh-attach-name" title={att.name}>
          {att.name}
        </span>
        <span className="sh-attach-size">{formatBytes(att.size)}</span>
      </span>
      {dlButton}
    </div>
  );
}
