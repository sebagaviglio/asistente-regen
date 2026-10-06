// src/termsText.js
//
// Términos y Condiciones de la suscripción (BORRADOR sin revisión legal).
//
// TERMS_VERSION tiene que ser igual a la del Worker (src/terms.js). Al pagar, la app
// devuelve la versión del texto que la persona leyó; si no coincide con la del Worker,
// el pago no se abre y se le pide recargar. Cuando el abogado apruebe el texto, se
// cambia la versión en los DOS lugares.
//
// ANTES DE COBRAR CON CLAVES REALES hay que completar los datos entre corchetes
// ([domicilio], [email de contacto], [teléfono o WhatsApp], [N]) y que lo revise un abogado.

export const TERMS_VERSION = '2026-10-v1-borrador';

export const TERMS_SECTIONS = [
  {
    title: '1. Quiénes somos y aceptación',
    paragraphs: [
      '1.1. REGEN es un servicio de Gaviglio Sebastián Luis, CUIT 20-30846222-7, con domicilio en [domicilio], Córdoba, Argentina (“REGEN”, “nosotros”).',
      '1.2. Estos términos rigen la suscripción a los planes de REGEN y el uso de su plataforma web, su asistente y sus servicios asociados.',
      '1.3. Al suscribirte aceptás estos términos en la versión vigente. Guardamos la fecha, la hora y la versión que aceptaste.',
      '1.4. Para suscribirte tenés que ser mayor de 18 años.',
    ],
  },
  {
    title: '2. El servicio y su alcance',
    paragraphs: [
      '2.1. Según el plan contratado, la suscripción puede incluir: entrevistas por voz con el asistente de REGEN, seguimiento con un coach, validación de tu ficha por un médico, paneles de análisis con extracción a domicilio y acceso a tu evolución dentro de la plataforma. El detalle de cada plan figura en la página de planes al momento de contratar.',
      '2.2. REGEN acompaña hábitos y bienestar. No promete resultados: describe lo que incluye cada plan y el cuerpo de cada persona responde a su manera.',
      '2.3. El asistente no diagnostica ni indica tratamientos. La validación médica es una revisión de tu ficha por un profesional matriculado; no reemplaza la consulta con tu médico de cabecera ni la atención presencial cuando haga falta.',
      '2.4. REGEN no es un servicio de emergencias. Ante un síntoma grave o una urgencia, llamá al 107 o acudí a la guardia más cercana.',
    ],
  },
  {
    title: '3. Planes, precios y pagos',
    paragraphs: [
      '3.1. Los precios están en pesos argentinos e incluyen todos los impuestos. Lo que ves al contratar es lo que pagás.',
      '3.2. Los planes Core y Activo se cobran por mes, por adelantado, a través de Mercado Pago. REGEN no recibe ni guarda los datos de tu tarjeta.',
      '3.3. La suscripción se renueva sola cada mes hasta que la des de baja. Cada cobro tiene su factura electrónica, que te llega por email.',
      '3.4. El plan Elite tiene cupos limitados y se contrata a través de un formulario de contacto. Sus condiciones particulares se acuerdan por escrito.',
      '3.5. El Diagnóstico inicial es un pago único y no es una suscripción.',
      '3.6. Si falla un cobro, Mercado Pago lo reintenta y te avisamos. Durante 7 días seguís usando el servicio con normalidad. Pasado ese plazo se suspenden las llamadas y las validaciones hasta que se regularice el pago. Tu ficha sigue disponible para que la consultes.',
      '3.7. Cambios de precio. Te avisamos por email y en la plataforma con al menos 30 días de anticipación. El nuevo precio se aplica recién en el primer cobro posterior a ese plazo. Si no estás de acuerdo, podés darte de baja antes, sin costo.',
      '3.8. Los cupones de descuento y los accesos de cortesía tienen las condiciones que se informan al otorgarlos y no son acumulables, salvo que se indique lo contrario.',
    ],
  },
  {
    title: '4. Baja y arrepentimiento',
    paragraphs: [
      '4.1. Botón de baja. Podés dar de baja tu suscripción cuando quieras desde el link “Botón de baja”, visible en todas las páginas y en “Mi suscripción”. No hace falta iniciar sesión ni hacer otro trámite: alcanza con tu email y tu DNI.',
      '4.2. Al pedir la baja te damos un código de trámite en el momento, en pantalla y por email. La baja corta los cobros siguientes. Seguís teniendo acceso hasta el final del período que ya pagaste.',
      '4.3. Botón de arrepentimiento. Tenés 10 días corridos desde que contrataste para arrepentirte, según el artículo 34 de la Ley 24.240 y el artículo 1110 del Código Civil y Comercial. Lo pedís desde el link “Botón de arrepentimiento”, con el mismo procedimiento y el mismo código de trámite.',
      '4.4. Si te arrepentís de una suscripción dentro de ese plazo, te devolvemos el total por el mismo medio de pago.',
      '4.5. En el Diagnóstico inicial podés arrepentirte hasta 24 horas antes del turno de extracción.',
    ],
  },
  {
    title: '5. Uso del servicio y datos',
    paragraphs: [
      '5.1. Cada plan tiene un tope mensual de minutos de voz y de validaciones médicas, informado en la página de planes. Lo que no usás en el mes no se acumula para el siguiente.',
      '5.2. Para empezar te pedimos que subas tus últimos análisis. Sos responsable de que lo que cargás sea tuyo y esté completo. Si no tenés análisis recientes, podés contratar el Diagnóstico inicial.',
      '5.3. La extracción a domicilio se hace con turno previo, en la dirección que indiques, por personal de un laboratorio habilitado. Si no estás en el horario acordado, el turno puede reprogramarse una sola vez sin costo.',
      '5.4. La cuenta es personal. No la compartas ni uses la de otra persona.',
      '5.5. Tratamos tus datos personales y de salud según la Ley 25.326 y el consentimiento informado que aceptaste al registrarte. Los datos de pago los procesa Mercado Pago y se guardan separados de tu información de salud.',
      '5.6. Aunque des de baja la suscripción, podés seguir consultando tu ficha. Para pedir el acceso, la corrección o la eliminación de tus datos, escribinos a [email de contacto].',
    ],
  },
  {
    title: '6. Otras condiciones',
    paragraphs: [
      '6.1. Propiedad intelectual. Los contenidos, la marca y el software de REGEN son de su titular. Tu información de salud es tuya.',
      '6.2. Disponibilidad. Trabajamos para que la plataforma funcione siempre, pero puede haber interrupciones por mantenimiento o fallas de terceros. Si una falla nuestra te impide usar el servicio por más de [N] días seguidos, te compensamos de forma proporcional.',
      '6.3. Suspensión. Podemos suspender una cuenta por uso abusivo, fraude o maltrato al equipo, con aviso previo salvo urgencia.',
      '6.4. Cambios en estos términos. Si los cambiamos, te avisamos con 30 días de anticipación y te pedimos que aceptes la nueva versión. Si no la aceptás, podés darte de baja sin costo.',
      '6.5. Ley aplicable. Rige la ley argentina. Como consumidor, podés reclamar ante la autoridad de defensa del consumidor y los tribunales de tu domicilio.',
      '6.6. Contacto. [email de contacto] · [teléfono o WhatsApp] · [domicilio].',
    ],
  },
];

// Para detectar a tiempo que quedaron datos sin completar antes de salir a producción.
export const TERMS_PLACEHOLDERS = TERMS_SECTIONS.flatMap((s) => s.paragraphs)
  .flatMap((p) => p.match(/\[[^\]]+\]/g) || []);
