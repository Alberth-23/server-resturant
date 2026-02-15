const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 🔍 Test conexión
app.get("/", async (req, res) => {
  res.json({ message: "API Restaurante funcionando 🚀" });
});

// 📋 Obtener productos
app.get("/productos", async (req, res) => {
  const result = await pool.query("SELECT * FROM productos WHERE activo = true");
  res.json(result.rows);
});

// 🍽 Crear pedido
app.post("/pedido", async (req, res) => {
  const { mesa_id, productos } = req.body;

  try {
    const pedido = await pool.query(
      "INSERT INTO pedidos (mesa_id) VALUES ($1) RETURNING *",
      [mesa_id]
    );

    let total = 0;

    for (let item of productos) {
      const productoDB = await pool.query(
        "SELECT * FROM productos WHERE id = $1",
        [item.producto_id]
      );

      const precio = productoDB.rows[0].precio;
      const subtotal = precio * item.cantidad;
      total += subtotal;

      await pool.query(
        `INSERT INTO detalle_pedido 
        (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
        VALUES ($1, $2, $3, $4, $5)`,
        [pedido.rows[0].id, item.producto_id, item.cantidad, precio, subtotal]
      );
    }

    await pool.query(
      "UPDATE pedidos SET total = $1 WHERE id = $2",
      [total, pedido.rows[0].id]
    );

    res.json({ message: "Pedido creado", total });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al crear pedido" });
  }
});

// 👨‍🍳 Ver pedidos para chef
app.get("/pedidos", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM pedidos WHERE estado != 'cerrado' ORDER BY creado_en DESC"
  );
  res.json(result.rows);
});

// 💰 Cerrar pedido
app.put("/pedido/:id/cerrar", async (req, res) => {
  const { id } = req.params;

  await pool.query(
    "UPDATE pedidos SET estado = 'cerrado' WHERE id = $1",
    [id]
  );

  res.json({ message: "Pedido cerrado" });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Servidor corriendo 🚀");
});

