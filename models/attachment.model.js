import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true,
    trim: true
  },
  fileUrl: {
    type: String,
    required: true,
    trim: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  fileType: {
    type: String,
    required: true,
    trim: true
  },
  mimeType: {
    type: String,
    required: true,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  folder: {
    type: String,
    trim: true,
    default: null
  },
  tags: [{
    type: String,
    trim: true
  }],
}, {
  timestamps: true
});

attachmentSchema.index({ createdBy: 1 });
attachmentSchema.index({ fileType: 1 });
attachmentSchema.index({ mimeType: 1 });
attachmentSchema.index({ createdAt: -1 });
attachmentSchema.index({ folder: 1 });

const Attachment = mongoose.model('Attachment', attachmentSchema);

export default Attachment;
