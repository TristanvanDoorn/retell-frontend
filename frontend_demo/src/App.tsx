import React, { useEffect, useState } from "react";
import "./App.css";
import { RetellWebClient } from "retell-client-js-sdk";
import { supabase } from './supabase';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8080";
const agentId = process.env.REACT_APP_AGENT_ID;
const BASE_PATH = process.env.REACT_APP_BASE_PATH || '';
const WEBHOOK_URL = process.env.REACT_APP_WEBHOOK_URL;
const PHONE_NUMBER = process.env.REACT_APP_PHONE_NUMBER;

if (!agentId) {
  throw new Error('REACT_APP_AGENT_ID is not defined in environment variables');
}

if (!WEBHOOK_URL) {
  throw new Error('REACT_APP_WEBHOOK_URL is not defined in environment variables');
}

if (!PHONE_NUMBER) {
  throw new Error('REACT_APP_PHONE_NUMBER is not defined in environment variables');
}

interface RegisterCallResponse {
  access_token: string;
}

const retellWebClient = new RetellWebClient();

const App = () => {
  const [isCalling, setIsCalling] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isCheckingMic, setIsCheckingMic] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [medewerkers, setMedewerkers] = useState<any[]>([]);
  const [voornaam, setVoornaam] = useState('');
  const [achternaam, setAchternaam] = useState('');
  const [medewerkerTelefoon, setMedewerkerTelefoon] = useState('');
  const [medewerkerError, setMedewerkerError] = useState('');
  const [medewerkerSuccess, setMedewerkerSuccess] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  // Initialize the SDK
  useEffect(() => {
    retellWebClient.on("call_started", () => {
      console.log("call started");
      setHasError(false);
      setIsTransitioning(false);
      setIsCheckingMic(false);
    });
    
    retellWebClient.on("call_ended", () => {
      console.log("call ended");
      setIsCalling(false);
      setHasError(false);
      setIsTransitioning(false);
    });
    
    retellWebClient.on("agent_start_talking", () => {
      console.log("agent_start_talking");
    });
    
    retellWebClient.on("agent_stop_talking", () => {
      console.log("agent_stop_talking");
    });
    
    retellWebClient.on("audio", (audio) => {
      // console.log(audio);
    });
    
    retellWebClient.on("update", (update) => {
      // console.log(update);
    });
    
    retellWebClient.on("metadata", (metadata) => {
      // console.log(metadata);
    });
    
    retellWebClient.on("error", (error) => {
      console.error("An error occurred:", error);
      setHasError(true);
      retellWebClient.stopCall();
      setIsCalling(false);
      setIsTransitioning(false);
      setIsCheckingMic(false);
    });
  }, []);

  // Ophalen medewerkers bij laden
  useEffect(() => {
    fetchMedewerkers();
  }, []);

  async function fetchMedewerkers() {
    const { data, error } = await supabase
      .from('medewerkers_bellijst')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(10);
    if (!error) setMedewerkers(data || []);
  }

  const checkMicrophonePermission = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Microfoon permissie geweigerd:', error);
      return false;
    }
  };

  const toggleConversation = async () => {
    if (isTransitioning || isCheckingMic) return;

    if (isCalling) {
      setIsTransitioning(true);
      retellWebClient.stopCall();
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        setMediaStream(null);
      }
      setIsMuted(false);
    } else {
      try {
        setIsCheckingMic(true);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMediaStream(stream);
        const hasMicPermission = !!stream;
        stream.getTracks().forEach(track => track.stop());
        if (!hasMicPermission) {
          setHasError(true);
          setIsCheckingMic(false);
          return;
        }
        setIsTransitioning(true);
        setHasError(false);
        const registerCallResponse = await registerCall(agentId);
        if (registerCallResponse.access_token) {
          await retellWebClient.startCall({
            accessToken: registerCallResponse.access_token,
          });
          setIsCalling(true);
          setIsMuted(false);
        }
      } catch (error) {
        console.error("Failed to start call:", error);
        setHasError(true);
        setIsTransitioning(false);
      }
      setIsCheckingMic(false);
    }
  };

  async function registerCall(agentId: string): Promise<RegisterCallResponse> {
    try {
      const response = await fetch(`${BACKEND_URL}/create-web-call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_id: agentId,
        }),
      });
  
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
  
      const data: RegisterCallResponse = await response.json();
      return data;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  const getMicrophoneClass = () => {
    if (isCheckingMic || isTransitioning) return 'mic-processing';
    if (hasError) return 'mic-error';
    if (isCalling) return 'mic-listening';
    return '';
  };

  const getStatusText = () => {
    if (isCheckingMic) return 'Microfoon toestemming vragen...';
    if (isTransitioning) return 'Verbinding maken...';
    if (hasError) return 'Microfoon toestemming geweigerd';
    if (isCalling) return 'Luisteren';
    return 'Klik om te starten';
  };

  const formatPhoneNumber = (input: string): string => {
    // Verwijder alle niet-numerieke karakters
    const numbers = input.replace(/\D/g, '');
    
    // Als het nummer met 0 begint, vervang dit door +31
    if (numbers.startsWith('0')) {
      return '+31' + numbers.substring(1);
    }
    
    // Als het nummer met 31 begint, voeg + toe
    if (numbers.startsWith('31')) {
      return '+' + numbers;
    }
    
    return numbers;
  };

  const validatePhoneNumber = (number: string): boolean => {
    // Check of het nummer voldoet aan het formaat +31612345678
    const phoneRegex = /^\+31[1-9][0-9]{8}$/;
    return phoneRegex.test(number);
  };

  const handlePhoneInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const formattedNumber = formatPhoneNumber(input);
    setPhoneNumber(formattedNumber);
    
    if (formattedNumber.length > 0) {
      if (!validatePhoneNumber(formattedNumber)) {
        setPhoneError('Voer een geldig Nederlands mobiel nummer in: +31612345678');
      } else {
        setPhoneError('');
      }
    } else {
      setPhoneError('');
    }
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validatePhoneNumber(phoneNumber)) {
      setPhoneError('Voer een geldig Nederlands mobiel nummer in: +31612345678');
      return;
    }

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': window.location.origin
        },
        mode: 'cors',
        credentials: 'omit',
        body: JSON.stringify({
          phoneNumber: phoneNumber
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Sluit panel
      setIsPanelOpen(false);
      
      // Reset form
      setPhoneNumber('');
      setPhoneError('');
      
      // Toon success message
      setShowSuccess(true);
      
      // Verberg success message na 5 seconden
      setTimeout(() => {
        setShowSuccess(false);
      }, 5000);
    } catch (error) {
      console.error('Fout bij verwerken terugbelverzoek:', error);
      setPhoneError('Er is een fout opgetreden. Probeer het later opnieuw.');
    }
  };

  // Helper om NL mobiel nummer te formatteren naar +316XXXXXXXX
  function formatMedewerkerTelefoon(input: string) {
    let numbers = input.replace(/\D/g, '');
    if (numbers.startsWith('0')) {
      numbers = '31' + numbers.substring(1);
    }
    if (numbers.startsWith('31')) {
      numbers = '+' + numbers;
    }
    if (!numbers.startsWith('+31')) {
      numbers = '+31' + numbers;
    }
    // Alleen +316XXXXXXXX (mobiel)
    if (numbers.startsWith('+3106')) {
      numbers = '+316' + numbers.substring(5);
    }
    return numbers;
  }

  function validateMedewerkerTelefoon(nr: string) {
    // Alleen +316XXXXXXXX
    return /^\+316[0-9]{8}$/.test(nr);
  }

  const MAX_MEDEWERKERS = 10;

  async function handleAddMedewerker(e: React.FormEvent) {
    e.preventDefault();
    setMedewerkerError('');
    setMedewerkerSuccess('');
    const formatted = formatMedewerkerTelefoon(medewerkerTelefoon);
    if (!voornaam || !achternaam || !medewerkerTelefoon) {
      setMedewerkerError('Alle velden zijn verplicht.');
      return;
    }
    if (!validateMedewerkerTelefoon(formatted)) {
      setMedewerkerError('Ongeldig telefoonnummer. Gebruik +316XXXXXXXX.');
      return;
    }
    if (medewerkers.length >= MAX_MEDEWERKERS) {
      setMedewerkerError(`Maximaal ${MAX_MEDEWERKERS} medewerkers toegestaan.`);
      return;
    }
    const { error } = await supabase.from('medewerkers_bellijst').insert({
      voornaam,
      achternaam,
      telefoonnummer: formatted
    });
    if (error) {
      setMedewerkerError('Fout bij opslaan.');
    } else {
      setMedewerkerSuccess('Medewerker toegevoegd!');
      setVoornaam('');
      setAchternaam('');
      setMedewerkerTelefoon('');
      fetchMedewerkers();
    }
  }

  async function handleDeleteMedewerker(id: number) {
    await supabase.from('medewerkers_bellijst').delete().eq('id', id);
    fetchMedewerkers();
  }

  // Mute/unmute functionaliteit
  const handleMuteToggle = () => {
    if (!mediaStream) return;
    const newMuteState = !isMuted;
    mediaStream.getAudioTracks().forEach(track => {
      track.enabled = !newMuteState;
    });
    setIsMuted(newMuteState);
  };

  return (
    <div className="app-container">
      <div className="header">
        <img 
          src="/xpots_logo.png"
          alt="XPOTS logo"
          className="logo"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            console.error('Logo failed to load:', img.src);
            img.src = 'https://henk-urqz.onrender.com/tmc-taxameter-centrale-logo-2.png';
          }}
        />
        <h1 className={isCalling ? 'hidden' : ''}>
          Waarmee kan ik u van dienst zijn?
        </h1>
      </div>

      <div className="voice-container">
        <div 
          className={`microphone-animation ${getMicrophoneClass()}`}
          onClick={toggleConversation}
        >
          {isCalling && !hasError && (
            <>
              <div className="listening-halo halo-1"></div>
              <div className="listening-halo halo-2"></div>
              <div className="listening-halo halo-3"></div>
            </>
          )}
          <svg className="mic-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <div className="status-text">{getStatusText()}</div>
        {isCalling && !hasError && (
          <button
            className="mute-button"
            style={{ marginTop: '2rem', padding: '1rem 2rem', fontSize: '1.1rem', borderRadius: '8px', border: 'none', background: isMuted ? '#ff4a4a' : '#ff6900', color: '#fff', cursor: 'pointer' }}
            onClick={handleMuteToggle}
          >
            {isMuted ? 'Microfoon aanzetten' : 'Microfoon muten'}
          </button>
        )}
      </div>

      {/* Call Button */}
      <button className="call-button" onClick={() => setIsPanelOpen(true)}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
        </svg>
      </button>

      {/* Overlay */}
      <div className={`overlay ${isPanelOpen ? 'show' : ''}`} onClick={() => setIsPanelOpen(false)} />

      {/* Phone Panel */}
      <div className={`phone-panel ${isPanelOpen ? 'show' : ''}`}>
        <div className="panel-header">
          <h2>Medewerkers bellijst</h2>
          <button className="close-button" onClick={() => setIsPanelOpen(false)}>&times;</button>
        </div>
        <form className="medewerker-form" onSubmit={handleAddMedewerker}>
          <input
            type="text"
            placeholder="Voornaam"
            value={voornaam}
            onChange={e => setVoornaam(e.target.value)}
            required
            disabled={medewerkers.length >= MAX_MEDEWERKERS}
          />
          <input
            type="text"
            placeholder="Achternaam"
            value={achternaam}
            onChange={e => setAchternaam(e.target.value)}
            required
            disabled={medewerkers.length >= MAX_MEDEWERKERS}
          />
          <input
            type="tel"
            placeholder="+31612345678"
            value={medewerkerTelefoon}
            onChange={e => setMedewerkerTelefoon(formatMedewerkerTelefoon(e.target.value))}
            required
            disabled={medewerkers.length >= MAX_MEDEWERKERS}
            maxLength={12}
          />
          <button type="submit" disabled={medewerkers.length >= MAX_MEDEWERKERS}>Toevoegen</button>
        </form>
        {medewerkerError && <div className="error-message">{medewerkerError}</div>}
        {medewerkerSuccess && <div className="success-message">{medewerkerSuccess}</div>}
        <ul className="medewerkers-lijst">
          {medewerkers.map(medewerker => (
            <li key={medewerker.id}>
              {medewerker.voornaam} {medewerker.achternaam} - {medewerker.telefoonnummer}
              <button onClick={() => handleDeleteMedewerker(medewerker.id)}>Verwijder</button>
            </li>
          ))}
        </ul>
        {medewerkers.length === 0 && <div>Geen medewerkers toegevoegd.</div>}
      </div>

      {/* Success Message */}
      <div className={`success-message ${showSuccess ? 'show' : ''}`}>
        We bellen u zo terug!
      </div>
    </div>
  );
};

export default App;