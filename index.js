require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");

// Firebase Admin Init
const decodedKey = Buffer.from(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64,
  "base64"
).toString("utf8");

const serviceAccount = JSON.parse(decodedKey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(cors());
app.use(express.json());

const aiRoutes = require("./Routes/aiRoutes");
app.use("/api/ai", aiRoutes);

// Firebase Token Verification Middleware
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const idToken = authHeader.split(" ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.firebaseUser = decodedToken;
    next();
  } catch (error) {
    console.error("Firebase Token Verification Failed:", error.message);
    return res
      .status(401)
      .json({ message: "Unauthorized: Invalid or expired token" });
  }
};
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(`${process.env.MONGODB_URI}`, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

console.log(process.env.MONGODB_URI);

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // operation start
    const db = client.db("SupperShop");
    const userCollection = db.collection("users");
    const categoryCollection = db.collection("category");
    const productCollection = db.collection("products");
    const reviewCollection = db.collection("review");
    const cartCollection = db.collection("cart");
    const orderCollection = db.collection("orders");

    // top product

    app.get("/top-selling-products", async (req, res) => {
      try {
        const topProducts = await orderCollection
          .aggregate([
            { $unwind: "$items" },
            {
              $group: {
                _id: "$items.productId",
                productName: { $first: "$items.productName" },
                productImage: { $first: "$items.productImage" },
                totalSold: { $sum: "$items.quantity" },
                totalRevenue: {
                  $sum: { $multiply: ["$items.price", "$items.quantity"] },
                },
              },
            },
            { $sort: { totalSold: -1 } },
            { $limit: 10 },
          ])
          .toArray();

        res.status(200).json(topProducts);
      } catch (error) {
        console.error("Aggregation error:", error);
        res.status(500).json({
          message: "Error fetching top selling products",
          error,
        });
      }
    });

    // GET top-selling-products
    app.get("/top-selling-products", async (req, res) => {
      try {
        const topProducts = await Order.aggregate([
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.productId",
              productName: { $first: "$items.productName" },
              productImage: { $first: "$items.productImage" },
              totalSold: { $sum: "$items.quantity" },
              totalRevenue: {
                $sum: { $multiply: ["$items.price", "$items.quantity"] },
              },
            },
          },
          { $sort: { totalSold: -1 } },
          { $limit: 5 },
        ]);

        res.status(200).json(topProducts);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching top selling products", error });
      }
    });

    // discount
    app.put("/product/:id/discount", async (req, res) => {
      const { id } = req.params;
      const { discount } = req.body;

      if (typeof discount === "undefined" || isNaN(discount)) {
        return res.status(400).json({ error: "Invalid discount value" });
      }

      try {
        const existingProduct = await productCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!existingProduct) {
          return res.status(404).json({ error: "Product not found" });
        }

        const originalPrice = existingProduct.price;
        const newDiscount = Number(discount);

        const calculatedFinalPrice =
          originalPrice - (newDiscount * originalPrice) / 100;

        const updateResult = await productCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          {
            $set: {
              discount: newDiscount,
              finalPrice: calculatedFinalPrice,
            },
          },
          { returnDocument: "after" }
        );

        if (!updateResult.value) {
          return res
            .status(404)
            .json({ error: "Product not found after update" });
        }

        res.json(updateResult.value);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update discount" });
      }
    });

    // get discount product

    app.get("/discount", async (req, res) => {
      const result = await productCollection
        .find({
          discount: { $gt: 0 },
        })
        .toArray();
      res.send(result);
    });

    // all-orders

    app.get("/all-orders", async (req, res) => {
      const result = await orderCollection.find().toArray();
      res.send(result);
    });

    // my-orders

    app.get("/my-orders/:email", async (req, res) => {
      const email = req.params.email;

      const result = await orderCollection.find({ userEmail: email }).toArray();

      res.send(result);
    });

    // order status

    app.patch("/update-order-status/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      try {
        const result = await orderCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        res.send({ success: true });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Failed to update order" });
      }
    });

    app.patch("/cancel-order/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const result = await orderCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "cancelled" } }
        );

        res.send({ success: true });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Failed to cancel order" });
      }
    });

    // Delete a product by ID
    app.delete("/product/:id", async (req, res) => {
      const { id } = req.params;

      if (!id) return res.status(400).send({ error: "Product ID is required" });

      try {
        // Delete the product from products collection
        const result = await productCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 1) {
          // Optionally, remove this product from all users' wishlists
          await userCollection.updateMany(
            { wishlist: id },
            { $pull: { wishlist: id } }
          );

          // Optionally, remove this product from all carts
          await cartCollection.deleteMany({ productId: id });

          res.send({ success: true, message: "Product deleted successfully" });
        } else {
          res
            .status(404)
            .send({ success: false, message: "Product not found" });
        }
      } catch (error) {
        console.error("Error deleting product:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    // Checkout API
    app.post("/checkout", async (req, res) => {
      const { email } = req.body;
      if (!email) return res.status(400).send({ error: "Email is required" });

      try {
        // Step 1: Get cart items of this user
        const cartItems = await cartCollection
          .find({ userEmail: email })
          .toArray();
        if (!cartItems.length) {
          return res.status(400).send({ error: "Cart is empty" });
        }

        // Step 2: Get user info
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ error: "User not found" });
        }

        // Step 3: Calculate total
        const totalAmount = cartItems.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );

        // Step 4: Prepare order
        const order = {
          userId: user._id,
          userEmail: user.email,
          customerName: user.name,
          phone: user.phone,
          billingAddress: user.billingAddress,
          items: cartItems.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            productImage: item.productImage,
            price: item.price,
            quantity: item.quantity,
          })),
          totalAmount,
          status: "pending",
          orderDate: new Date(),
        };

        // Step 5: Save order
        const orderResult = await orderCollection.insertOne(order);

        // Step 6: Update stock
        for (const item of cartItems) {
          await productCollection.updateOne(
            { _id: new ObjectId(item.productId) },
            { $inc: { stock: -item.quantity } }
          );
        }

        // Step 7: Clear cart
        await cartCollection.deleteMany({ userEmail: email });

        res.send({ success: true, orderId: orderResult.insertedId });
      } catch (error) {
        console.error("Checkout error:", error);
        res.status(500).send({ error: "Failed to complete checkout" });
      }
    });

    // Dashboard stats
    app.get("/admin-dashboard-stats", async (req, res) => {
      try {
        const totalUsers = await userCollection.countDocuments();
        const totalProducts = await productCollection.countDocuments();
        const totalCategories = await categoryCollection.countDocuments();
        const totalOrders = await cartCollection.countDocuments();
        const totalReviews = await reviewCollection.countDocuments();

        // Category wise product count
        const categoryStats = await productCollection
          .aggregate([{ $group: { _id: "$categoryId", count: { $sum: 1 } } }])
          .toArray();

        res.send({
          totalUsers,
          totalProducts,
          totalCategories,
          totalOrders,
          totalReviews,
          categoryStats,
        });
      } catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).send({ error: "Failed to fetch dashboard stats" });
      }
    });

    // Add to Cart (POST)
    app.post("/add-to-cart", async (req, res) => {
      const cartItem = req.body;
      cartItem.date = new Date();
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    // get all cart product
    app.get("/all-cart", async (req, res) => {
      const result = await cartCollection.find().toArray();
      res.send(result);
    });

    // GET /cart?email=user@gmail.com
    app.get("/cart", async (req, res) => {
      const { email } = req.query;
      if (!email) return res.status(400).send({ error: "Email required" });

      try {
        const cartItems = await cartCollection
          .find({ userEmail: email })
          .toArray();
        res.send(cartItems);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch cart" });
      }
    });

    // Delete cart item by _id
    app.delete("/cart/:itemId", async (req, res) => {
      const { itemId } = req.params;

      if (!itemId) return res.status(400).send({ error: "Item ID required" });

      try {
        const result = await cartCollection.deleteOne({
          _id: new ObjectId(itemId),
        });

        if (result.deletedCount === 1) {
          res.send({ message: "Item removed successfully" });
        } else {
          res.status(404).send({ error: "Item not found" });
        }
      } catch (err) {
        console.error("Cart remove error:", err);
        res.status(500).send({ error: "Failed to remove item" });
      }
    });

    // get all review
    app.get("/all-review", verifyFirebaseToken, async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    // Delete a review
    app.delete("/review/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const result = await reviewCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 1) {
          res.send({ success: true, message: "Review deleted successfully" });
        } else {
          res.status(404).send({ success: false, message: "Review not found" });
        }
      } catch (error) {
        console.error("Error deleting review:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    // Get reviews by product
    app.get("/reviews/:productId", async (req, res) => {
      const result = await reviewCollection
        .find({ productId: req.params.productId })
        .toArray();
      res.send(result);
    });

    // Post review
    app.post("/reviews", async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });

    // Get user by email
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      try {
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }
        res.send(user);
      } catch (error) {
        res.status(500).send({ message: "Server error", error: error.message });
      }
    });

    // get all user
    app.get("/all-user", async (req, res) => {
      const user = await userCollection.find().toArray();
      res.send(user);
    });

    // Update user profile
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const updatedData = req.body;
      try {
        const result = await userCollection.updateOne(
          { email },
          { $set: updatedData },
          { upsert: false }
        );
        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "User not found" });
        }
        res.send({ message: "Profile updated successfully" });
      } catch (error) {
        res.status(500).send({ message: "Server error", error: error.message });
      }
    });

    // get user role
    app.get("/get-user-role", verifyFirebaseToken, async (req, res) => {
      try {
        const email = req.firebaseUser?.email;

        if (!email) {
          return res.status(400).send({ message: "Invalid user" });
        }

        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ message: "ok", role: user.role });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Something went wrong" });
      }
    });

    // get single user by email
    app.get("/user/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ error: "User not found" });
        }
        res.send(user);
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).send({ error: "Something went wrong" });
      }
    });

    // update user by email
    app.put("/update-user/:email", async (req, res) => {
      const { email } = req.params;
      const updateData = req.body;

      try {
        const result = await userCollection.updateOne(
          { email },
          { $set: updateData },
          { upsert: true }
        );
        res.send(result);
      } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).send({ error: "Something went wrong" });
      }
    });

    // add user (during registration)
    app.post("/add-user", async (req, res) => {
      const user = req.body;
      try {
        const existing = await userCollection.findOne({ email: user.email });
        if (existing) {
          return res.send({ message: "User already exists" });
        }
        const result = await userCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        console.error("Error adding user:", error);
        res.status(500).send({ error: "Something went wrong" });
      }
    });

    // Add product to wishlist
    app.post("/wishlist-by-email", async (req, res) => {
      const { email, productId } = req.body;
      if (!email || !productId)
        return res.status(400).send({ error: "Missing email or productId" });

      try {
        const user = await userCollection.findOne({ email });
        if (!user) return res.status(404).send({ error: "User not found" });

        const result = await userCollection.updateOne(
          { email },
          { $addToSet: { wishlist: productId } }
        );
        res.send({ success: true, result });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ success: false, message: "Failed to add to wishlist" });
      }
    });

    // Remove product from wishlist
    app.delete("/wishlist-by-email", async (req, res) => {
      const { email, productId } = req.body;

      if (!email || !productId) {
        return res.status(400).send({ error: "Missing email or productId" });
      }

      try {
        const result = await userCollection.updateOne(
          { email },
          { $pull: { wishlist: productId } }
        );
        res.send({ success: true, result });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ success: false, message: "Failed to remove from wishlist" });
      }
    });

    app.get("/wishlist-by-email/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const user = await userCollection.findOne(
          { email },
          { projection: { wishlist: 1 } }
        );

        if (!user || !user.wishlist?.length) return res.send([]);

        const products = await productCollection
          .find({ _id: { $in: user.wishlist.map((id) => new ObjectId(id)) } })
          .toArray();

        res.send(products);
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch wishlist" });
      }
    });

    // add category
    app.post("/add-category", async (req, res) => {
      const categoryData = req.body;
      const result = await categoryCollection.insertOne(categoryData);
      res.send(result);
    });

    // get category
    app.get("/get-category", async (req, res) => {
      const allCategory = await categoryCollection.find().toArray();
      res.send(allCategory);
    });

    // add product
    app.post("/add-product", async (req, res) => {
      const product = req.body;
      product.createdAt = new Date();
      if (product.expiryDate) {
        product.expiryDate = new Date(product.expiryDate);
      }
      const result = await productCollection.insertOne(product);
      res.send(result);
    });

    // all product
    app.get("/all-products", async (req, res) => {
      const allProduct = await productCollection.find().toArray();
      res.send(allProduct);
    });

    // product details page

    app.get("/product/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const product = await productCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send(product);
      } catch (error) {
        res.status(500).send({ error: "Product not found" });
      }
    });

    // GET products by category ID
    app.get("/products-by-category/:categoryId", async (req, res) => {
      const { categoryId } = req.params;
      try {
        const products = await productCollection.find({ categoryId }).toArray();
        res.send(products);
      } catch (error) {
        console.error("Error fetching products by category ID:", error);
        res.status(500).send({ error: "Something went wrong" });
      }
    });

    // operation end

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello world");
});

app.listen(port, (req, res) => {
  console.log(`Server running on port ${port}`);
});
