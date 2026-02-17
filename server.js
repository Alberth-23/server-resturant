const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();

// ====== MIDDLEWARE ======
app.use(cors());
app.use(express.json());

// ====== DATABASE ======
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ====== RUTA TEST ======
app.get("/", (req, res) => {
  res.json({ mensaje: "API Restaurante funcionando 🚀" });
});

// ====== OBTENER PRODUCTOS ======
app.get("/productos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM productos ORDER BY id");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo productos" });
  }
});

// ====== CREAR PEDIDO ======
app.post("/pedido", async (req, res) => {
  const { mesa_id, productos } = req.body;

  try {
    // Crear pedido
    const pedidoResult = await pool.query(
      "INSERT INTO pedidos (mesa_id, estado) VALUES ($1, 'pendiente') RETURNING id",
      [mesa_id]
    );

    const pedido_id = pedidoResult.rows[0].id;

    let total = 0;

    // Insertar detalle del pedido
    for (let item of productos) {
      const productoDB = await pool.query(
        "SELECT precio FROM productos WHERE id = $1",
        [item.producto_id]
      );

      const precio = productoDB.rows[0].precio;
      total += precio * item.cantidad;

      await pool.query(
        "INSERT INTO pedido_detalle (pedido_id, producto_id, cantidad, precio_unitario) VALUES ($1, $2, $3, $4)",
        [pedido_id, item.producto_id, item.cantidad, precio]
      );
    }

    res.json({ mensaje: "Pedido creado", total });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error creando pedido" });
  }
});

// ====== REGISTRO TEMPORAL ======
app.post("/crear-admin", async (req, res) => {
  const { nombre, email, password, rol } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await pool.query(
      "INSERT INTO usuarios (nombre, email, password, rol) VALUES ($1,$2,$3,$4)",
      [nombre, email, hashedPassword, rol]
    );

    res.json({ mensaje: "Usuario creado" });
  } catch (error) {
    res.status(500).json({ error: "Error creando usuario" });
  }
});

// ====== LOGIN ======
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM usuarios WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Usuario no encontrado" });
    }

    const user = result.rows[0];

    // Comparación directa SIN bcrypt
    if (user.password !== password) {
      return res.status(401).json({ error: "Contraseña incorrecta" });
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
    console.error(error);
    res.status(500).json({ error: "Error en login" });
  }
});



// ====== INICIAR SERVIDOR ======
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT} 🚀`);
});
