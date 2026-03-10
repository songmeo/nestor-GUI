import { useState, useEffect } from 'react';
import { api, type Device, type Boot, type Record } from './api/nestor';
import './App.css';

function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [boots, setBoots] = useState<Boot[]>([]);
  const [selectedBoot, setSelectedBoot] = useState<number | null>(null);
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch devices on mount
  useEffect(() => {
    console.log('Fetching devices...');
    api.getDevices()
      .then(res => {
        console.log('Got devices:', res);
        setDevices(res.devices || []);
      })
      .catch(err => {
        console.error('Error fetching devices:', err);
        setError(err.message);
      });
  }, []);

  // Fetch boots when device selected
  useEffect(() => {
    if (!selectedDevice) {
      setBoots([]);
      return;
    }
    setLoading(true);
    api.getBoots(selectedDevice)
      .then(res => {
        setBoots(res.boots || []);
        setSelectedBoot(null);
        setRecords([]);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedDevice]);

  // Fetch records when boot selected
  useEffect(() => {
    if (!selectedDevice || selectedBoot === null) {
      setRecords([]);
      return;
    }
    setLoading(true);
    api.getRecords(selectedDevice, [selectedBoot], { limit: 100 })
      .then(res => setRecords(res.records || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedDevice, selectedBoot]);

  const formatTimestamp = (ts: number): string => {
    return new Date(ts * 1000).toLocaleString();
  };

  return (
    <div className="app">
      <header>
        <h1>🔌 Nestor — CF3D Data Viewer</h1>
      </header>

      {error && <div className="error">Error: {error}</div>}

      <div className="container">
        {/* Devices Panel */}
        <section className="panel">
          <h2>Devices</h2>
          {devices.length === 0 ? (
            <p className="muted">No devices found</p>
          ) : (
            <ul className="device-list">
              {devices.map(d => (
                <li
                  key={d.device}
                  className={selectedDevice === d.device ? 'selected' : ''}
                  onClick={() => setSelectedDevice(d.device)}
                >
                  <strong>{d.device}</strong>
                  <span className="muted">Last: {formatTimestamp(d.last_heard_ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Boots Panel */}
        <section className="panel">
          <h2>Boots {selectedDevice && `(${selectedDevice})`}</h2>
          {loading && <p>Loading...</p>}
          {!selectedDevice ? (
            <p className="muted">Select a device</p>
          ) : boots.length === 0 ? (
            <p className="muted">No boots found</p>
          ) : (
            <ul className="boot-list">
              {boots.map(b => (
                <li
                  key={b.boot_id}
                  className={selectedBoot === b.boot_id ? 'selected' : ''}
                  onClick={() => setSelectedBoot(b.boot_id)}
                >
                  <strong>Boot #{b.boot_id}</strong>
                  <span className="muted">
                    {formatTimestamp(b.first_record.commit_ts)} — {formatTimestamp(b.last_record.commit_ts)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Records Panel */}
        <section className="panel records-panel">
          <h2>CAN Records {selectedBoot !== null && `(Boot #${selectedBoot})`}</h2>
          {loading && <p>Loading...</p>}
          {selectedBoot === null ? (
            <p className="muted">Select a boot session</p>
          ) : records.length === 0 ? (
            <p className="muted">No records found</p>
          ) : (
            <table className="records-table">
              <thead>
                <tr>
                  <th>Time (µs)</th>
                  <th>Seq</th>
                  <th>CAN ID</th>
                  <th>Ext</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={`${r.boot_id}-${r.seqno}`}>
                    <td>{r.hw_ts_us.toLocaleString()}</td>
                    <td>{r.seqno}</td>
                    <td className="mono">0x{r.frame.can_id.toString(16).toUpperCase().padStart(3, '0')}</td>
                    <td>{r.frame.extended ? '✓' : ''}</td>
                    <td className="mono">{r.frame.data_hex.toUpperCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

export default App;
