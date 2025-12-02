// Placeholder Firebase service layer for Almanac Wayang feature.
// Replace dummy implementations with real Firestore logic when backend is ready.

const dummyCharacters = [
  {
    id: 'bima',
    name: 'Bima',
    aliases: ['Werkudara', 'Bratasena'],
    description: 'Putra kedua Pandawa dengan tubuh kekar dan hati lurus. Bima identik dengan keadilan.',
    weapon: 'Kuku Pancanaka',
    family: { father: 'Pandu', mother: 'Dewi Kunti' },
    imageUrl: 'https://placehold.co/600x900?text=Bima',
    tier: 'Pandawa',
    temperament: 'Tegas, jujur, protektif'
  },
  {
    id: 'semar',
    name: 'Semar',
    aliases: ['Ki Lurah Semar', 'Ismaya'],
    description: 'Tokoh Punakawan yang menjadi pengasuh Pandawa dengan kebijaksanaan yang mendalam.',
    weapon: 'Kebijaksanaan',
    family: { father: 'Sang Hyang Tunggal', mother: 'Dewi Rekatawati' },
    imageUrl: 'https://placehold.co/600x900?text=Semar',
    tier: 'Punakawan',
    temperament: 'Rendah hati, jenaka, penuh welas asih'
  },
  {
    id: 'duryodana',
    name: 'Duryodana',
    aliases: ['Suyodhana'],
    description: 'Pemimpin Kurawa yang licik namun karismatik, rival utama Pandawa.',
    weapon: 'Gada Baloramas',
    family: { father: 'Destarata', mother: 'Gandari' },
    imageUrl: 'https://placehold.co/600x900?text=Duryodana',
    tier: 'Kurawa',
    temperament: 'Ambisius, manipulatif, teguh pada tujuannya'
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
