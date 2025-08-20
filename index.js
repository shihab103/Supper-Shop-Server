const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
require("dotenv").config();
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");

// Firebase Admin Init
const decodedKey = Buffer.from(`./admin-key.json`,'base64').toString('utf8');
const serviceAccount = JSON.parse(decodedKey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(cors());
app.use(express.json());

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

    // Add to Cart (POST)
    app.post("/add-to-cart", async (req, res) => {
      const cartItem = req.body;
      cartItem.date = new Date();
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    // Get specific user cart by MongoDB userId
    app.get("/cart/:userId", async (req, res) => {
      try {
        const userId = req.params.userId;

        // Ensure user exists
        const user = await userCollection.findOne({
          _id: new ObjectId(userId),
        });
        if (!user) return res.status(404).send({ message: "User not found" });

        // Fetch cart for this user
        const cart = await cartCollection.find({ userId: userId }).toArray();
        res.send(cart);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch cart" });
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
