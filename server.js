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
  res.send("Servidor funcionando 🔥 VERSION ACTUALIZADA");
});
// ===============================
// OBTENER PRODUCTOS
// ===============================
app.get("/productos", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, nombre, precio FROM productos WHERE activo = true ORDER BY id ASC"
    );

    res.json(result.rows);

  } catch (error) {
    console.error("Error obteniendo productos:", error);
    res.status(500).json({ error: "Error obteniendo productos" });
  }
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

    // 🔥 Fallback automático si Railway no tiene la variable
    const secret = process.env.JWT_SECRET || "fallback_super_secret_123";

    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      secret,
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
// CREAR PEDIDO (CLIENTE)
// ===============================
app.post("/pedidos", async (req, res) => {
  const { mesa, productos, total } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO pedidos (mesa, productos, total)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [mesa, productos, total]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error creando pedido:", error);
    res.status(500).json({ error: "Error al crear pedido" });
  }
});

// ===============================
// LISTAR PEDIDOS
// ===============================
app.get("/pedidos", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM pedidos ORDER BY creado_en DESC"
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error obteniendo pedidos:", error);
    res.status(500).json({ error: "Error al obtener pedidos" });
  }
});

// ===============================
// ACTUALIZAR ESTADO PEDIDO
// ===============================
app.put("/pedidos/:id", async (req, res) => {
  const { estado } = req.body;
  const { id } = req.params;

  try {
    const result = await pool.query(
      "UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING *",
      [estado, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error actualizando pedido:", error);
    res.status(500).json({ error: "Error actualizando pedido" });
  }
});


// ===============================
// INICIAR SERVIDOR
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log("JWT_SECRET detectado:", process.env.JWT_SECRET ? "SI" : "NO (usando fallback)");
});
