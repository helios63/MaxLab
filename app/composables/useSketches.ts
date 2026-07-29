import bouncingSquare from '~/sketches/bouncingSquare'
import camRandom from '~/sketches/camRandom'
import faceDistort from '~/sketches/faceDistort'
import liquidBubbler from '~/sketches/liquidBubbler'
import soundSquares from '~/sketches/soundSquares'
import timeFlowers from '~/sketches/timeFlowers'
import timeGrid from '~/sketches/timeGrid'
import timePhysics from '~/sketches/timePhysics'

export const sketches = [
  { slug: 'bouncing-squares', name: 'BouncingSquares', factory: bouncingSquare },
  { slug: 'time-flowers',     name: 'Time Flowers',    factory: timeFlowers    },
  { slug: 'time-grid',        name: 'Time Grid',       factory: timeGrid       },
  { slug: 'time-physics',     name: 'Time Physics',    factory: timePhysics    },
  { slug: 'cam-random',       name: 'Cam Random',      factory: camRandom      },
  { slug: 'liquid-bubbler',   name: 'Liquid Bubbler',  factory: liquidBubbler  },
  { slug: 'sound-squares',    name: 'Sound Squares',   factory: soundSquares   },
  { slug: 'face-distort',     name: 'Face Distort',    factory: faceDistort    },
]
