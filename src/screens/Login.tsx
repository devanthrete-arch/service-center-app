import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bike, ChevronRight, Wrench } from 'lucide-react';
import { DEV_PERSONAS } from '../domain/types';
import { devStaffSession, errorMessage } from '../lib/api';
import { setAccessToken } from '../lib/session';
import { ErrorText } from './ui';

export function Login() {
  const navigate = useNavigate();
  const [persona, setPersona] = useState('advisor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = DEV_PERSONAS.find((item) => item.key === persona);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      setAccessToken(await devStaffSession(persona));
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not start a staff session'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <section className="login-brand">
        <div className="logo-mark">
          <Bike />
          <Wrench />
        </div>
        <p>AUTOFLEX</p>
        <h1>Keep every service job moving.</h1>
        <span>Apex Auto Garage · local staff session while Frevels IAM is off.</span>
      </section>
      <form className="login-card" onSubmit={onSubmit}>
        <div className="eyebrow">LOCAL STAFF SESSION</div>
        <h2>Sign in to the floor</h2>
        <p>Pick a seeded persona. Any OTP is accepted on the customer app; here the role is chosen directly.</p>
        <label>
          Who are you?
          <select value={persona} onChange={(event) => setPersona(event.target.value)}>
            {DEV_PERSONAS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name} · {item.role}
              </option>
            ))}
          </select>
        </label>
        {selected ? <p>{selected.detail}</p> : null}
        <ErrorText error={error} />
        <button className="primary" type="submit" disabled={busy}>
          Continue <ChevronRight />
        </button>
        <small>POST /v1/dev/session · start the backend with npm run start:memory</small>
      </form>
    </main>
  );
}
