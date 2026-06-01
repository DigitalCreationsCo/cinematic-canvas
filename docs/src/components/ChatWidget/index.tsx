import React, { useEffect } from 'react';

// Component to load the chat widget script
const ChatScriptLoader = () => {
  useEffect(() => {
    if (!document.querySelector('script[src*="portals-embedded-chat"]')) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/gh/portals-ai/portals-embedded-chat@main/dist/build/static/js/bundle.min.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  return null;
};

declare global {
    namespace JSX {
      interface IntrinsicElements {
        "portals-chat": any;
      }
    }
  }

  export default function ChatWidget({ className }) {
    return (
      <div className={className}>
        <ChatScriptLoader />
        <portals-chat
          host_url="http://localhost:7860"
          flow_id="YOUR_FLOW_ID"
        ></portals-chat>
      </div>
    );
  }