const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
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

// ====== INICIAR SERVIDOR ======
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT} 🚀`);
});
