// routes/images.js
import { createClient } from '@supabase/supabase-js'
import express from 'express'

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

// 📦 Endpoint que devuelve múltiples imágenes optimizadas
router.post('/images/batch', async (req, res) => {
  try {
    const { images } = req.body // [{ path: 'hero.png', width: 1200 }, ...]
    
    const imageUrls = await Promise.all(
      images.map(async ({ path, width = 800, quality = 80 }) => {
        const { data } = supabase
          .storage
          .from('crsnimages')
          .getPublicUrl(path, {
            transform: { width, quality }
          })
        
        return {
          name: path.replace(/\.[^.]+$/, ''), // 'hero' sin extensión
          path,
          url: data.publicUrl,
          width,
          quality
        }
      })
    )

    res.json({ images: imageUrls })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router