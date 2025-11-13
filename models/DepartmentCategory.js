const mongoose = require('mongoose');

const departmentCategorySchema = new mongoose.Schema({
  departmentId: { type: Number, unique: true },
  name: { type: String, required: true, unique: true },
});

departmentCategorySchema.pre('save', async function (next) {
  if (this.isNew) {
    const last = await mongoose.model('DepartmentCategory').findOne().sort({ departmentId: -1 });
    this.departmentId = last ? last.departmentId + 1 : 1;
  }
  next();
});

module.exports = mongoose.model('DepartmentCategory', departmentCategorySchema);
