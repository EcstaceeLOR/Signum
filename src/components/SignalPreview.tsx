export function SignalPreview() {
  return (
    <div
      className="signal-preview"
      aria-label="Example signal: tap, rest, tap, tap"
    >
      <span className="signal-preview__label">TX–01</span>
      <div className="signal-preview__track" aria-hidden="true">
        <i className="signal-preview__beat signal-preview__beat--active" />
        <i className="signal-preview__beat" />
        <i className="signal-preview__beat signal-preview__beat--active" />
        <i className="signal-preview__beat signal-preview__beat--active" />
      </div>
      <span className="signal-preview__status">Armed</span>
    </div>
  )
}
