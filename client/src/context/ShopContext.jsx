// Informações públicas da barbearia (nome, contato, horários) disponíveis em todo o app.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const ShopContext = createContext({ settings: {}, hours: [], holidays: [], reload: () => {} });

export function ShopProvider({ children }) {
  const [info, setInfo] = useState({ settings: { shop_name: 'Barbearia' }, hours: [], holidays: [], loaded: false });
  const reload = useCallback(async () => {
    try {
      const d = await api.get('/public/info');
      setInfo({ ...d, loaded: true });
      if (d.settings?.shop_name) document.title = d.settings.shop_name;
    } catch {
      setInfo((i) => ({ ...i, loaded: true }));
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return <ShopContext.Provider value={{ ...info, reload }}>{children}</ShopContext.Provider>;
}

export const useShop = () => useContext(ShopContext);
