// Contacto y redes de Mercapty. La web (pie de página y Tiendas) y la app los leen de
// /api/meta, así que un cambio aquí también llega a la app sin publicar otra versión.
// Un campo vacío ('') no se muestra. El correo también está escrito en public/privacidad.html.
//
// Instagram va como usuario, que es lo que Instagram pone en su dirección. Facebook comparte
// la página con un enlace corto que no lleva el nombre dentro, así que ahí va { text, url }:
// el enlace entero y, aparte, el nombre que se ve en la web y en la app.
const CONTACT = {
  email: 'ptymerca@gmail.com',
  whatsapp: '+50765189265', // con el código del país
  instagram: 'mercapty01', // usuario, sin @
  facebook: { text: 'Mercapty', url: 'https://www.facebook.com/share/19PBG94yaP/' },
};

// +50765189265 -> +507 6518-9265 (los celulares de Panamá tienen 8 dígitos).
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
    ...(instagram ? { instagram: typeof instagram === 'string' ? { text: `@${instagram}`, url: `https://www.instagram.com/${instagram}/` } : instagram } : {}),
    ...(facebook ? { facebook: typeof facebook === 'string' ? { text: facebook, url: `https://www.facebook.com/${facebook}` } : facebook } : {}),
  };
}
