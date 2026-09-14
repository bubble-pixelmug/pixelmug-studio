import s1ProIcon from '../assets/s1pro.png';
import s1LiteIcon from '../assets/s1lite.png';
import p1Icon from '../assets/p1.png';
import fallbackIcon from '../assets/device-icon.png';

export function deviceIconFor(device={}) {
  const modelCode=String(device.sn||'').toUpperCase().slice(4,8);
  if(modelCode==='TTUX') return {src:p1Icon,model:'P1',kind:'p1'};
  if(modelCode==='TZVG') return {src:s1ProIcon,model:'S1 Pro',kind:'s1'};
  if(modelCode==='TZVM') return {src:s1LiteIcon,model:'S1 Lite',kind:'s1'};
  return {src:fallbackIcon,model:'PixelMug',kind:'fallback'};
}
