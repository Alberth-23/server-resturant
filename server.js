require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

// ===============================
// CONEXIÓN A POSTGRES (RAILWAY)
// ===============================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// ===============================
// RUTA TEST
// ===============================
app.get("/", (req, res) => {
  res.send("Servidor funcionando VERSION NUEVA 🔥");
});


// ===============================
// LOGIN (SIN BCRYPT)
// ===============================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM usuarios WHERE email = $1",
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Usuario no encontrado" });
    }

    const user = result.rows[0];

    // Comparación directa (texto plano)
    if (user.password.trim() !== password.trim()) {
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: "JWT_SECRET no configurado" });
    }

    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      rol: user.rol,
      nombre: user.nombre
    });

  } catch (error) {
    console.error("ERROR LOGIN:", error);
    res.status(500).json({ error: "Error en login" });
  }
});

// ===============================
// INICIAR SERVIDOR
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
