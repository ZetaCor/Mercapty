// Contacto y redes de Mercapty. La web (pie de página y Tiendas) y la app los leen de
// /api/meta, así que un cambio aquí también llega a la app sin publicar otra versión.
// Un campo vacío ('') no se muestra. El correo también está escrito en public/privacidad.html.
const CONTACT = {
  email: 'ptymerca@gmail.com',
  whatsapp: '+50765374371', // con el código del país
  instagram: 'mercapty', // usuario, sin @
  facebook: 'mercapty', // nombre de la página
};

// +50765374371 -> +507 6537-4371 (los celulares de Panamá tienen 8 dígitos).
function formatPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  const m = /^507(\d{4})(\d{4})$/.exec(digits);
  return m ? `+507 ${m[1]}-${m[2]}` : `+${digits}`;
}

// { canal: { text, url } } solo con los canales que tienen dato.
export function contactInfo() {
  const { email, whatsapp, instagram, facebook } = CONTACT;
  return {
    ...(email ? { email: { text: email, url: `mailto:${email}` } } : {}),
    ...(whatsapp ? { whatsapp: { text: formatPhone(whatsapp), url: `https://wa.me/${whatsapp.replace(/\D/g, '')}` } } : {}),
    ...(instagram ? { instagram: { text: `@${instagram}`, url: `https://www.instagram.com/${instagram}/` } } : {}),
    ...(facebook ? { facebook: { text: facebook, url: `https://www.facebook.com/${facebook}` } } : {}),
  };
}
