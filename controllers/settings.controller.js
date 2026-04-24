import asyncHandler from "express-async-handler";
import Setting from "../models/setting.model.js";

const getAllSettings = asyncHandler(async (req, res) => {
  const settings = await Setting.findOne();


  res.status(200).json(settings || {});
});

const updateSetting = asyncHandler(async (req, res) => {
  const setting = await Setting.findOne();

  const processedBody = { ...req.body };

  if (req.body.maintenance_allowed_ips !== undefined) {
    if (typeof req.body.maintenance_allowed_ips === 'string') {
      try {
        processedBody.maintenance_allowed_ips = JSON.parse(req.body.maintenance_allowed_ips);
      } catch {
        processedBody.maintenance_allowed_ips = req.body.maintenance_allowed_ips
          .split(',')
          .map(item => item.trim())
          .filter(item => item);
      }
    } else {
      processedBody.maintenance_allowed_ips = req.body.maintenance_allowed_ips;
    }
  }

  if (req.body.allowed_file_upload_types !== undefined) {
    if (typeof req.body.allowed_file_upload_types === 'string') {
      try {
        processedBody.allowed_file_upload_types = JSON.parse(req.body.allowed_file_upload_types);
      } catch {
        processedBody.allowed_file_upload_types = req.body.allowed_file_upload_types
          .split(',')
          .map(item => item.trim())
          .filter(item => item);
      }
    } else {
      processedBody.allowed_file_upload_types = req.body.allowed_file_upload_types;
    }
  }

  if (req.body.maintenance_mode !== undefined) {
    processedBody.maintenance_mode = req.body.maintenance_mode === true || req.body.maintenance_mode === 'true';
  }

  if (setting) {
    const updatedSetting = await Setting.findByIdAndUpdate(setting._id, processedBody, {
      returnDocument: 'after',
      runValidators: true,
    });
    res.status(200).json(updatedSetting);
  } else {
    const newSetting = await Setting.create(processedBody);
    res.status(201).json(newSetting);
  }
});

export { getAllSettings, updateSetting };
