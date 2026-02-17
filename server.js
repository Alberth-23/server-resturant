// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const app = express();

// ===============================
// MIDDLEWARES
// ===============================
app.use(cors({
  // En producción puedes poner tu dominio de frontend:
  // origin: process.env.FRONTEND_URL || "*",
  origin: "*", // abierto (ajusta si quieres más seguridad)
}));
app.use(express.json());

// ===============================
// CONEXIÓN A BASE DE DATOS
// ===============================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway normalmente requiere SSL
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
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
// CREAR PEDIDO (CLIENTE) - POST /pedidos
// ===============================
app.post("/pedidos", async (req, res) => {
  const { mesa_id, productos } = req.body;
  // productos: [{ producto_id, cantidad }, ...]

  // Validación básica
  if (!mesa_id || !Array.isArray(productos) || productos.length === 0) {
    return res.status(400).json({
      error: "Datos de pedido inválidos. Se requiere mesa_id y al menos un producto.",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Crear el pedido en tabla pedidos
    const insertPedidoQuery = `
      INSERT INTO pedidos (mesa_id, estado, total)
      VALUES ($1, 'pendiente', 0)
      RETURNING *;
    `;
    const { rows: [pedido] } = await client.query(insertPedidoQuery, [mesa_id]);

    // 2. Insertar detalles en detalle_pedido
    const insertDetalleQuery = `
      INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad)
      VALUES ($1, $2, $3);
    `;

    for (const item of productos) {
      if (!item.producto_id || !item.cantidad || item.cantidad <= 0) {
        throw new Error("Producto inválido en el pedido");
      }

      await client.query(insertDetalleQuery, [
        pedido.id,
        item.producto_id,
        item.cantidad,
      ]);
    }

    // 3. (Opcional pero recomendable) Calcular total en base a precios de productos
    const totalQuery = `
      SELECT COALESCE(SUM(pr.precio * dp.cantidad), 0) AS total
      FROM detalle_pedido dp
      JOIN productos pr ON pr.id = dp.producto_id
      WHERE dp.pedido_id = $1;
    `;
    const { rows: [totalRow] } = await client.query(totalQuery, [pedido.id]);

    await client.query(
      "UPDATE pedidos SET total = $1 WHERE id = $2",
      [totalRow.total, pedido.id]
    );

    await client.query("COMMIT");

    // Puedes devolver el pedido actualizado con total
    res.status(201).json({
      ...pedido,
      total: totalRow.total,
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creando pedido:", error);
    res.status(500).json({ error: "Error creando pedido" });
  } finally {
    client.release();
  }
});

// ===============================
// LISTAR PEDIDOS PENDIENTES (CHEF) - GET /pedidos
// ===============================
app.get("/pedidos", async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id,
        p.mesa_id,
        p.estado,
        p.total,
        p.creado_en,
        COALESCE(
          json_agg(
            json_build_object(
              'detalle_id', dp.id,
              'producto_id', dp.producto_id,
              'cantidad', dp.cantidad,
              'nombre', pr.nombre,
              'precio', pr.precio
            )
          ) FILTER (WHERE dp.id IS NOT NULL),
          '[]'
        ) AS productos
      FROM pedidos p
      LEFT JOIN detalle_pedido dp ON dp.pedido_id = p.id
      LEFT JOIN productos pr ON pr.id = dp.producto_id
      WHERE p.estado = 'pendiente'
      GROUP BY p.id
      ORDER BY p.creado_en ASC;
    `;

    const { rows } = await pool.query(query);
    res.json(rows);

  } catch (error) {
    console.error("Error obteniendo pedidos:", error);
    res.status(500).json({ error: "Error al obtener pedidos" });
  }
});

// ===============================
// ACTUALIZAR ESTADO PEDIDO - PUT /pedidos/:id
// ===============================
app.put("/pedidos/:id", async (req, res) => {
  const { estado } = req.body;
  const { id } = req.params;

  // Opcional: validar estado contra los permitidos
  const estadosValidos = ["pendiente", "en_preparacion", "listo", "cerrado"];
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: "Estado de pedido inválido" });
  }

  try {
    const result = await pool.query(
      "UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING *",
      [estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error actualizando pedido:", error);
    res.status(500).json({ error: "Error actualizando pedido" });
  }
});

// ===============================
// LOGIN (SIN BCRYPT) - POST /login
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

    if (user.password.trim() !== password.trim()) {
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }

    const secret = process.env.JWT_SECRET || "fallback_super_secret_123";

    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      secret,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      rol: user.rol,
      nombre: user.nombre,
    });

  } catch (error) {
    console.error("ERROR LOGIN:", error);
    res.status(500).json({ error: "Error en login" });
  }
});

// ===============================
// MIDDLEWARE DE ERROR GENÉRICO (OPCIONAL)
// ===============================
app.use((err, req, res, next) => {
  console.error("Error no controlado:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// ===============================
// INICIAR SERVIDOR
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log("JWT_SECRET detectado:", process.env.JWT_SECRET ? "SI" : "NO (usando fallback)");
});