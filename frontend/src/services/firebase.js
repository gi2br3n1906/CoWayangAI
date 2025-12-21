// Placeholder Firebase service layer for Almanac Wayang feature.
// Replace dummy implementations with real Firestore logic when backend is ready.

const dummyCharacters = [
  // ===== PANDAWA =====
  {
    id: 'arjuna',
    name: 'Arjuna',
    aliases: ['Janaka', 'Permadi', 'Parta', 'Dananjaya'],
    description: 'Putra ketiga Pandu dan Kunti dari dewa Indra. Arjuna adalah ksatria terbaik Pandawa, ahli memanah yang tiada tanding. Ia menerima ajaran Bhagawadgita dari Kresna sebelum perang Bharatayuddha. Memiliki busur Gandiwa dan panah Pasupati pemberian Batara Guru.',
    weapon: 'Busur Gandiwa, Panah Pasupati',
    family: { father: 'Pandu', mother: 'Dewi Kunti' },
    imageUrl: '/images/wayang/arjuna.png',
    tier: 'Pandawa',
    temperament: 'Halus budi, cerdas, pemberani'
  },
  {
    id: 'bima',
    name: 'Bima',
    aliases: ['Werkudara', 'Bratasena', 'Bimasena'],
    description: 'Putra kedua Pandawa, lahir dari dewa Bayu (dewa angin). Bertubuh kekar dengan kekuatan luar biasa. Bima dikenal dengan sifat jujur, tegas, dan tidak bisa berbohong. Memiliki kuku Pancanaka yang sangat tajam sebagai senjata utamanya.',
    weapon: 'Kuku Pancanaka, Gada Rujakpolo',
    family: { father: 'Pandu', mother: 'Dewi Kunti' },
    imageUrl: '/images/wayang/bima.webp',
    tier: 'Pandawa',
    temperament: 'Tegas, jujur, protektif'
  },
  {
    id: 'gatotkaca',
    name: 'Gatotkaca',
    aliases: ['Kacanegara', 'Guritna'],
    description: 'Putra Bima dan Dewi Arimbi (putri raksasa). Gatotkaca memiliki kemampuan terbang dengan Kotang Antrakusuma dan dikenal dengan julukan "otot kawat tulang besi". Gugur sebagai pahlawan dalam perang Bharatayuddha melawan Karna dengan senjata Konta.',
    weapon: 'Brajamusti, Brajadenta',
    family: { father: 'Bima', mother: 'Dewi Arimbi' },
    imageUrl: '/images/wayang/gatotkaca.jpeg',
    tier: 'Pandawa',
    temperament: 'Gagah berani, setia, patriotik'
  },
  {
    id: 'kresna',
    name: 'Kresna',
    aliases: ['Narayana', 'Kesawa', 'Bathara Kresna'],
    description: 'Raja Dwarawati, penasihat utama Pandawa dan titisan Dewa Wisnu. Kresna menjadi kusir kereta Arjuna dalam perang Bharatayuddha dan mengajarkan Bhagawadgita. Dikenal sangat bijaksana dan menjadi dalang kemenangan Pandawa.',
    weapon: 'Cakra Sudarsana',
    family: { father: 'Basudewa', mother: 'Dewi Rohini' },
    imageUrl: '/images/wayang/kresna.jpg',
    tier: 'Pandawa',
    temperament: 'Bijaksana, tenang, strategis'
  },
  {
    id: 'puntadewa',
    name: 'Puntadewa',
    aliases: ['Yudhistira', 'Darmakusuma'],
    description: 'Putra sulung Pandawa dari dewa Dharma. Puntadewa adalah raja yang sangat adil dan tidak pernah berbohong seumur hidupnya. Setelah perang Bharatayuddha, ia naik ke surga dengan tubuh jasmani karena kesuciannya.',
    weapon: 'Jamus Kalimasada',
    family: { father: 'Pandu', mother: 'Dewi Kunti' },
    imageUrl: '/images/wayang/puntadewa.jpg',
    tier: 'Pandawa',
    temperament: 'Adil, bijaksana, sabar'
  },
  {
    id: 'nakula',
    name: 'Nakula',
    aliases: ['Pinten'],
    description: 'Putra kembar Pandawa dari Dewi Madrim dan dewa Aswin. Nakula dikenal sebagai pria tertampan di dunia pewayangan. Ahli dalam ilmu pengobatan dan memiliki kemampuan menyembuhkan.',
    weapon: 'Pedang Pulanggeni',
    family: { father: 'Pandu', mother: 'Dewi Madrim' },
    imageUrl: '/images/wayang/nakula.png',
    tier: 'Pandawa',
    temperament: 'Tampan, ahli pengobatan, setia'
  },
  {
    id: 'sadewa',
    name: 'Sadewa',
    aliases: ['Tangsen'],
    description: 'Putra kembar bungsu Pandawa dari Dewi Madrim. Sadewa sangat pandai dalam ilmu perbintangan dan ramalan. Bersama Nakula, ia selalu setia mendampingi kakak-kakaknya dalam segala perjuangan.',
    weapon: 'Pedang Pulanggeni',
    family: { father: 'Pandu', mother: 'Dewi Madrim' },
    imageUrl: '/images/wayang/sadewa.png',
    tier: 'Pandawa',
    temperament: 'Cerdas, ahli perbintangan, rendah hati'
  },
  {
    id: 'kunti',
    name: 'Kunti',
    aliases: ['Dewi Kunti', 'Prita'],
    description: 'Ibu dari tiga Pandawa tertua (Puntadewa, Bima, Arjuna). Kunti memiliki mantra untuk memanggil dewa dan mendapatkan anak dari mereka. Wanita yang sangat kuat dan bijaksana dalam mengasuh kelima Pandawa.',
    weapon: 'Mantra pemanggil dewa',
    family: { father: 'Prabu Kuntiboja', mother: '-' },
    imageUrl: '/images/wayang/kunti.jpg',
    tier: 'Pandawa',
    temperament: 'Bijaksana, tabah, penyayang'
  },
  {
    id: 'antareja',
    name: 'Antareja',
    aliases: ['Antasena Antareja'],
    description: 'Putra Bima dari Dewi Nagagini (putri naga). Antareja memiliki lidah beracun yang sangat mematikan. Ia rela mengorbankan diri demi kemenangan Pandawa dalam perang Bharatayuddha.',
    weapon: 'Lidah beracun',
    family: { father: 'Bima', mother: 'Dewi Nagagini' },
    imageUrl: '/images/wayang/antareja.png',
    tier: 'Pandawa',
    temperament: 'Pemberani, rela berkorban'
  },
  {
    id: 'antasena',
    name: 'Antasena',
    aliases: ['Anantasena'],
    description: 'Putra Bima dari Dewi Urangayu. Antasena memiliki kemampuan hidup di dalam air dan sangat sakti. Ia gugur sebagai pahlawan dalam perang Bharatayuddha.',
    weapon: 'Kekuatan air',
    family: { father: 'Bima', mother: 'Dewi Urangayu' },
    imageUrl: '/images/wayang/antasena.png',
    tier: 'Pandawa',
    temperament: 'Pemberani, sakti mandraguna'
  },
  {
    id: 'baladewa',
    name: 'Baladewa',
    aliases: ['Balarama', 'Kakrasana'],
    description: 'Kakak Kresna dan raja Mandura. Baladewa adalah ksatria yang sangat kuat dengan senjata Nenggala (alugoro). Meski bersaudara dengan Kresna, ia tidak ikut perang Bharatayuddha karena hubungan baik dengan kedua pihak.',
    weapon: 'Nenggala (Alugoro)',
    family: { father: 'Basudewa', mother: 'Dewi Rohini' },
    imageUrl: '/images/wayang/baladewa.png',
    tier: 'Pandawa',
    temperament: 'Kuat, tegas, netral'
  },
  {
    id: 'setyaki',
    name: 'Setyaki',
    aliases: ['Sancaka', 'Satyaki'],
    description: 'Murid Arjuna yang sangat setia kepada Pandawa. Setyaki adalah ksatria dari Lesanpura yang ikut bertempur dalam perang Bharatayuddha di pihak Pandawa.',
    weapon: 'Busur panah',
    family: { father: 'Prabu Setyajid', mother: '-' },
    imageUrl: '/images/wayang/setyaki.jpg',
    tier: 'Pandawa',
    temperament: 'Setia, pemberani, terampil'
  },
  {
    id: 'salya',
    name: 'Salya',
    aliases: ['Prabu Salya', 'Narasoma'],
    description: 'Raja Mandraka dan paman dari Nakula-Sadewa melalui ibu mereka Dewi Madrim. Meski bersimpati kepada Pandawa, Salya terpaksa bertempur di pihak Kurawa karena terikat janji. Menjadi senapati terakhir Kurawa.',
    weapon: 'Aji Candabirawa',
    family: { father: 'Prabu Mandraka', mother: '-' },
    imageUrl: '/images/wayang/salya.jpg',
    tier: 'Pandawa',
    temperament: 'Bijaksana, tragis, terhormat'
  },

  // ===== KURAWA =====
  {
    id: 'duryudana',
    name: 'Duryudana',
    aliases: ['Suyodhana', 'Kurupati'],
    description: 'Putra sulung Prabu Drestarastra dan pemimpin 100 Kurawa. Duryudana sangat ambisius dan iri terhadap Pandawa. Ia adalah pemicu utama perang Bharatayuddha namun juga ksatria yang gagah berani.',
    weapon: 'Gada Baloramas',
    family: { father: 'Drestarastra', mother: 'Dewi Gandari' },
    imageUrl: '/images/wayang/duryudana.jpg',
    tier: 'Kurawa',
    temperament: 'Ambisius, manipulatif, pemberani'
  },
  {
    id: 'dursasana',
    name: 'Dursasana',
    aliases: ['Duhsasana'],
    description: 'Adik Duryudana yang terkenal kejam. Dursasana adalah pelaku penghinaan terhadap Drupadi dengan mencoba membuka pakaiannya di balairung. Ia mati di tangan Bima yang meminum darahnya sebagai pembalasan.',
    weapon: 'Gada',
    family: { father: 'Drestarastra', mother: 'Dewi Gandari' },
    imageUrl: '/images/wayang/dursasana.jpg',
    tier: 'Kurawa',
    temperament: 'Kejam, kasar, penurut'
  },
  {
    id: 'sengkuni',
    name: 'Sengkuni',
    aliases: ['Shakuni', 'Trigantalpati'],
    description: 'Paman Kurawa dari pihak ibu, patih Hastinapura yang sangat licik. Sengkuni adalah dalang dari semua tipu muslihat Kurawa termasuk judi dadu yang merampas kerajaan Pandawa. Ahli dalam permainan dadu curang.',
    weapon: 'Tipu daya dan kelicikan',
    family: { father: 'Prabu Gandara', mother: '-' },
    imageUrl: '/images/wayang/sengkuni.jpg',
    tier: 'Kurawa',
    temperament: 'Licik, manipulatif, pengecut'
  },
  {
    id: 'drestarastra',
    name: 'Drestarastra',
    aliases: ['Dhritarashtra'],
    description: 'Raja Hastinapura yang buta sejak lahir. Drestarastra adalah ayah 100 Kurawa. Meski buta, ia memiliki kekuatan luar biasa. Kelemahannya adalah terlalu memanjakan anak-anaknya terutama Duryudana.',
    weapon: 'Kekuatan fisik luar biasa',
    family: { father: 'Wiyasa', mother: 'Ambika' },
    imageUrl: '/images/wayang/drestarastra.jpg',
    tier: 'Kurawa',
    temperament: 'Lemah hati, kasih sayang berlebih'
  },
  {
    id: 'durna',
    name: 'Durna',
    aliases: ['Drona', 'Kumbayana'],
    description: 'Guru agung yang mengajarkan ilmu perang kepada Pandawa dan Kurawa. Durna adalah guru panah terhebat namun terjebak kesetiaan pada Hastinapura. Ia gugur dalam perang karena tipu muslihat Kresna.',
    weapon: 'Busur dan panah',
    family: { father: 'Brahmana Bharadwaja', mother: '-' },
    imageUrl: '/images/wayang/durna.jpg',
    tier: 'Kurawa',
    temperament: 'Bijaksana, loyal, tragis'
  },

  // ===== PUNAKAWAN =====
  {
    id: 'semar',
    name: 'Semar',
    aliases: ['Badranaya', 'Ismaya', 'Ki Lurah Semar'],
    description: 'Punakawan tertua dan paling bijaksana. Semar sejatinya adalah jelmaan Batara Ismaya, kakak Batara Guru yang memilih turun ke bumi menjadi pengasuh ksatria. Ia adalah simbol rakyat jelata yang berjiwa luhur.',
    weapon: 'Kebijaksanaan dan humor',
    family: { father: 'Sang Hyang Tunggal', mother: 'Dewi Rekatawati' },
    imageUrl: '/images/wayang/semar.jpg',
    tier: 'Punakawan',
    temperament: 'Bijaksana, jenaka, rendah hati'
  },
  {
    id: 'gareng',
    name: 'Gareng',
    aliases: ['Nala Gareng', 'Pegatwaja'],
    description: 'Putra sulung Semar dengan ciri fisik tangan kiri bengkok, kaki pincang, dan mata juling. Kekurangan fisiknya melambangkan filosofi untuk tidak mencuri (tangan), tidak serakah (kaki), dan tidak silau duniawi (mata).',
    weapon: 'Kecerdikan dan humor',
    family: { father: 'Semar', mother: '-' },
    imageUrl: '/images/wayang/gareng.jpg',
    tier: 'Punakawan',
    temperament: 'Jenaka, filosofis, sederhana'
  },
  {
    id: 'petruk',
    name: 'Petruk',
    aliases: ['Kanthong Bolong', 'Dawala'],
    description: 'Putra kedua Semar dengan tubuh tinggi kurus dan hidung panjang. Petruk dikenal sangat humoris dan sering menghibur dengan lelucon. Julukan Kanthong Bolong menggambarkan sifatnya yang dermawan.',
    weapon: 'Humor dan kecerdasan',
    family: { father: 'Semar', mother: '-' },
    imageUrl: '/images/wayang/petruk.jpg',
    tier: 'Punakawan',
    temperament: 'Humoris, dermawan, cerdas'
  },
  {
    id: 'bagong',
    name: 'Bagong',
    aliases: ['Carub', 'Bawor'],
    description: 'Putra bungsu Semar yang diciptakan dari bayangan Semar sendiri. Bagong memiliki wajah mirip Semar dengan perut besar. Ia polos, jujur, dan sering berbicara blak-blakan tanpa tedeng aling-aling.',
    weapon: 'Kejujuran dan kepolosan',
    family: { father: 'Semar', mother: '-' },
    imageUrl: '/images/wayang/bagong.png',
    tier: 'Punakawan',
    temperament: 'Polos, jujur, blak-blakan'
  }
]

const dummyProgress = {}

export const getCharacters = async () => {
  return dummyCharacters
}

export const getUserProgress = async (userId) => {
  return dummyProgress[userId] || {}
}

export const unlockCharacter = async ({ userId, characterId, videoId }) => {
  if (!userId || !characterId) {
    throw new Error('userId and characterId are required')
  }

  if (!dummyProgress[userId]) {
    dummyProgress[userId] = {}
  }

  const alreadyUnlocked = Boolean(dummyProgress[userId][characterId])

  if (!alreadyUnlocked) {
    dummyProgress[userId][characterId] = {
      unlockedAt: new Date().toISOString(),
      videoId
    }
  }

  return {
    ...dummyProgress[userId][characterId],
    isNew: !alreadyUnlocked
  }
}
