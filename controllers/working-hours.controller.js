import { WorkingHours } from '../models/index.js';
import mongoose from 'mongoose';

export const upsertWorkingHours = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { waba_id, is_holiday_mode, ...days } = req.body;

        if (!waba_id) {
            return res.status(400).json({ success: false, message: 'waba_id is required' });
        }

        const payload = {
            user_id: userId,
            waba_id,
            is_holiday_mode: is_holiday_mode ?? false,
        };

        const weekDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        weekDays.forEach(day => {
            if (days[day]) {
                payload[day] = days[day];
            }
        });

        const workingHours = await WorkingHours.findOneAndUpdate(
            { waba_id, user_id: userId },
            { $set: payload },
            { returnDocument: 'after', upsert: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: 'Working hours successfully updated',
            data: workingHours
        });
    } catch (error) {
        console.error('Error in upsertWorkingHours:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update working hours',
            error: error.message
        });
    }
};

export const getWorkingHoursByWaba = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { waba_id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(waba_id)) {
            return res.status(400).json({ success: false, message: 'Invalid waba_id' });
        }

        const workingHours = await WorkingHours.findOne({ waba_id, user_id: userId }).lean();

        if (!workingHours) {
            return res.status(404).json({
                success: false,
                message: 'Working hours not found for this WABA'
            });
        }

        return res.status(200).json({
            success: true,
            data: workingHours
        });
    } catch (error) {
        console.error('Error in getWorkingHoursByWaba:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch working hours',
            error: error.message
        });
    }
};

export const deleteWorkingHours = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { waba_id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(waba_id)) {
            return res.status(400).json({ success: false, message: 'Invalid waba_id' });
        }

        const result = await WorkingHours.findOneAndDelete({ waba_id, user_id: userId });

        if (!result) {
            return res.status(404).json({ success: false, message: 'Working hours not found' });
        }

        return res.status(200).json({
            success: true,
            message: 'Working hours deleted successfully'
        });
    } catch (error) {
        console.error('Error in deleteWorkingHours:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete working hours',
            error: error.message
        });
    }
};

export default {
    upsertWorkingHours,
    getWorkingHoursByWaba,
    deleteWorkingHours
};
