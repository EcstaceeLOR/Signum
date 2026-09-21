const receiverModes = [
  { name: 'Pulse', beats: 4, volatility: 'Low' },
  { name: 'Carrier', beats: 6, volatility: 'Medium' },
  { name: 'Deepwave', beats: 8, volatility: 'High' },
] as const

export function App() {
  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="signum-title">
        <p className="eyebrow">Chain Jam Vol. 1</p>
        <h1 id="signum-title">Signum</h1>
        <p className="subtitle">Compose a signal. Receive Chain&apos;s echo.</p>

        <div className="signal" aria-label="Example signal">
          <span className="signal__beat signal__beat--active" />
          <span className="signal__beat" />
          <span className="signal__beat signal__beat--active" />
          <span className="signal__beat signal__beat--active" />
        </div>

        <p className="status">Foundation ready. Gameplay is being tuned.</p>
      </section>

      <section className="receivers" aria-labelledby="receiver-title">
        <div>
          <p className="eyebrow">Receivers</p>
          <h2 id="receiver-title">Choose your frequency</h2>
        </div>

        <div className="receiver-grid">
          {receiverModes.map((receiver) => (
            <article className="receiver-card" key={receiver.name}>
              <span>{receiver.beats} beats</span>
              <h3>{receiver.name}</h3>
              <p>{receiver.volatility} volatility</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
