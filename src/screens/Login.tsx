import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bike, ChevronRight, Wrench } from 'lucide-react';
import { devStaffSession, errorMessage } from '../lib/api';
import { setAccessToken } from '../lib/session';
import { ErrorText } from './ui';

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function sendCode(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (mobile.length < 10) {
      setError('Enter a 10-digit Indian mobile number.');
      return;
    }
    setStep('code');
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (code.length < 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    try {
      setAccessToken(await devStaffSession(mobile));
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
        <span>Apex Auto Garage · sign in with your staff mobile.</span>
      </section>
      {step === 'phone' ? (
        <form className="login-card" onSubmit={sendCode}>
          <div className="eyebrow">STAFF SIGN IN</div>
          <h2>Sign in to the floor</h2>
          <p>Use the mobile number on your staff profile. We&apos;ll send a one-time code.</p>
          <label>
            Mobile
            <input
              inputMode="numeric"
              autoComplete="tel"
              placeholder="9845000002"
              value={mobile}
              onChange={(event) => setMobile(digitsOnly(event.target.value).slice(0, 10))}
            />
          </label>
          <ErrorText error={error} />
          <button className="primary" type="submit">
            Send code <ChevronRight />
          </button>
          <small>
            Local mode accepts any 6-digit code. Apex staff: Meera 9845000001, Arjun 9845000002, Ravi
            9845000003, Sana 9845000004.
          </small>
        </form>
      ) : (
        <form className="login-card" onSubmit={verify}>
          <div className="eyebrow">STAFF SIGN IN</div>
          <h2>Enter the code</h2>
          <p>Sent to +91 {mobile}</p>
          <label>
            Code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(digitsOnly(event.target.value).slice(0, 6))}
            />
          </label>
          <ErrorText error={error} />
          <button className="primary" type="submit" disabled={busy}>
            Sign in <ChevronRight />
          </button>
          <button className="secondary" type="button" onClick={() => setStep('phone')}>
            Use a different number
          </button>
        </form>
      )}
    </main>
  );
}
