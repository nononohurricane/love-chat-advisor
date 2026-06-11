import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Heart, ImagePlus, Loader2, MessageCircle, QrCode, Send, Sparkles, X } from 'lucide-react';
import './styles.css';

const quickSamples = [
  '女生：今天好累，开了一天会。\n男生：那你早点睡吧。\n女生：嗯。',
  '男生：周末要不要一起看电影？\n女生：再说吧，最近有点忙。\n男生：你是不是不想见我？',
  '女生：你刚刚为什么一直没回我？\n男生：在打游戏，没看到。\n女生：每次都这样。'
];

const maxImages = 6;
const maxImageSize = 4 * 1024 * 1024;
const paymentAmount = 1;
const paymentQrCodeUrl = import.meta.env.VITE_PAYMENT_QR_CODE_URL || '/payment-qr-placeholder.svg';

async function requestAnalysis(input, images) {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ chat: input, images })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || '大模型分析失败，请稍后重试。');
  }

  return data;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`读取图片失败：${file.name}`));
    reader.readAsDataURL(file);
  });
}

function App() {
  const [input, setInput] = useState('');
  const [images, setImages] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const charCount = useMemo(() => input.trim().length, [input]);
  const hasContent = input.trim() || images.length > 0;
  const canSubmit = hasContent && paymentConfirmed && !loading;

  const handleImageChange = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    setError('');

    if (!files.length) return;

    const remaining = maxImages - images.length;
    if (remaining <= 0) {
      setError(`最多只能上传 ${maxImages} 张聊天截图。`);
      return;
    }

    const validFiles = files.slice(0, remaining).filter((file) => {
      if (!file.type.startsWith('image/')) {
        setError('只能上传 PNG、JPG、JPEG 或 WebP 图片。');
        return false;
      }
      if (file.size > maxImageSize) {
        setError('单张图片不能超过 4MB，请压缩后再上传。');
        return false;
      }
      return true;
    });

    try {
      const nextImages = await Promise.all(validFiles.map(async (file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        dataUrl: await readFileAsDataUrl(file)
      })));

      setImages((current) => [...current, ...nextImages]);
    } catch (err) {
      setError(err.message || '读取图片失败，请重新上传。');
    }
  };

  const removeImage = (id) => {
    setImages((current) => current.filter((image) => image.id !== id));
  };

  const confirmPayment = () => {
    setPaymentConfirmed(true);
    setPaymentOpen(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!hasContent || loading) return;

    if (!paymentConfirmed) {
      setPaymentOpen(true);
      return;
    }

    setLoading(true);
    setResult(null);
    setError('');

    try {
      const payloadImages = images.map(({ name, dataUrl }) => ({ name, dataUrl }));
      const analysis = await requestAnalysis(input, payloadImages);
      setResult(analysis);
      setPaymentConfirmed(false);
    } catch (err) {
      setError(err.message || '大模型分析失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="badge"><Heart size={16} /> 恋爱聊天分析助手</div>
        <h1>把聊天记录发给我，帮你拆解情绪、关系信号和下一句怎么回。</h1>
        <p>支持输入文字，也支持上传多张聊天截图。每次分析 1 元，扫码支付后即可把文字和图片发送给支持视觉能力的大模型分析。</p>
      </section>

      <section className="workspace">
        <form className="input-card" onSubmit={handleSubmit}>
          <div className="card-title">
            <MessageCircle />
            <div>
              <h2>输入聊天内容</h2>
              <span>可以粘贴聊天文字，也可以上传聊天截图；截图顺序建议按聊天时间从早到晚</span>
            </div>
          </div>

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={'例如：\n女生：今天好累，开了一天会。\n男生：那你早点睡吧。\n女生：嗯。\n\n我的目标：想让她觉得被理解，并继续聊下去。\n\n也可以只上传聊天截图，不输入文字。'}
          />

          <div className="upload-panel">
            <label className="upload-button">
              <ImagePlus size={18} />
              上传聊天截图
              <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" multiple onChange={handleImageChange} />
            </label>
            <span>最多 {maxImages} 张，单张不超过 4MB</span>
          </div>

          {images.length > 0 && (
            <div className="image-grid">
              {images.map((image, index) => (
                <div className="image-thumb" key={image.id}>
                  <img src={image.dataUrl} alt={`聊天截图 ${index + 1}`} />
                  <button type="button" onClick={() => removeImage(image.id)} aria-label="删除截图">
                    <X size={14} />
                  </button>
                  <span>截图 {index + 1}</span>
                </div>
              ))}
            </div>
          )}

          <div className="sample-row">
            {quickSamples.map((sample, index) => (
              <button key={sample} type="button" onClick={() => setInput(sample)}>
                示例 {index + 1}
              </button>
            ))}
          </div>

          <div className="pay-card">
            <div>
              <strong>单次分析 ¥{paymentAmount}</strong>
              <span>{paymentConfirmed ? '已确认支付，可发送分析' : '请先扫码支付，再发送给大模型分析'}</span>
            </div>
            <button type="button" className="pay-btn" disabled={!hasContent || loading} onClick={() => setPaymentOpen(true)}>
              <QrCode size={17} />
              扫码支付
            </button>
          </div>

          <div className="action-row">
            <span>{charCount} 字 · {images.length} 张截图</span>
            <button className="primary-btn" type="submit" disabled={!hasContent || loading}>
              {loading ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              {loading ? '分析中...' : paymentConfirmed ? '发送给大模型分析' : '支付后分析'}
            </button>
          </div>
        </form>

        <section className="result-card">
          {!result && !loading && !error && (
            <div className="empty-state">
              <Sparkles size={36} />
              <h2>分析结果会显示在这里</h2>
              <p>点击发送后，将结合文字和截图生成分析过程、关键判断、建议和可直接复制的回复模板。</p>
            </div>
          )}

          {loading && (
            <div className="empty-state">
              <Loader2 className="spin" size={36} />
              <h2>正在请求大模型分析</h2>
              <p>正在识别截图文字、情绪信号、互动模式和下一步沟通策略，请稍候。</p>
            </div>
          )}

          {error && !loading && (
            <div className="error-state">
              <h2>分析失败</h2>
              <p>{error}</p>
            </div>
          )}

          {result && (
            <div className="analysis">
              <div className="overview">
                <Sparkles />
                <p>{result.overview}</p>
              </div>

              <Block title="分析过程" items={result.process} ordered />
              <Block title="识别到的关系信号" items={result.signals} />
              <Block title="沟通建议" items={result.suggestions} />
              <Block title="可直接参考的回复" items={result.replyTemplates} quote />
              <Block title="注意事项" items={result.risk} />
            </div>
          )}
        </section>
      </section>

      {paymentOpen && (
        <div className="payment-mask" role="dialog" aria-modal="true" aria-label="扫码支付">
          <div className="payment-modal">
            <button className="modal-close" type="button" onClick={() => setPaymentOpen(false)} aria-label="关闭支付弹窗">
              <X size={18} />
            </button>
            <div className="payment-title">
              <QrCode />
              <div>
                <h2>扫码支付 ¥{paymentAmount}</h2>
                <p>支付完成后点击“我已支付”，即可开始本次分析。</p>
              </div>
            </div>
            <div className="qr-box">
              <img src={paymentQrCodeUrl} alt="收款二维码" />
            </div>
            <p className="payment-tip">当前为静态收款码模式，系统不会自动核验到账；正式上线建议接入微信/支付宝商户支付接口。</p>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setPaymentOpen(false)}>稍后支付</button>
              <button type="button" className="primary-btn" onClick={confirmPayment}>我已支付</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Block({ title, items, ordered = false, quote = false }) {
  const ListTag = ordered ? 'ol' : 'ul';
  return (
    <section className="analysis-block">
      <h3>{title}</h3>
      <ListTag className={quote ? 'quote-list' : undefined}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ListTag>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
