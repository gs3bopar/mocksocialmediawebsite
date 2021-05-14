import db from "../clients/database-client";
import Page from './create-page';
const Register = db.Register;

// save a Info and return the _id for the Info created
const create = async (req, res, next) => {
  let transaction;
  try {
    const {
      templateId,
      name,
      type,
      register
    } = req.body;
    if (!templateId) {
      res.status(400).send({
        message: "Template Id is required!"
      });
      return;
    }
    if (!name) {
      res.status(400).send({
        message: "Page name is required!"
      });
      return;
    }
    if (!type) {
      res.status(400).send({
        message: "Page Type is required!"
      });
      return;
    }
    if (!register && Array.isArray(register) && register.length > 0) {
      res.status(400).send({
        message: "Register data is required!"
      });
      return;
    }

    transaction = await db.sequelize.transaction();
    // create the page first
    const pageId = await Page.pageCreate({
      templateId,
      name,
      type
    }, transaction);

    const bulkRegisterRecords = [];
    for (let i = 0; i < register.length; i++) {
      bulkRegisterRecords.push({
        referenceValue: register[i].reference,
        displayName: register[i].displayName,
        required: register[i].required,
        type: register[i].type,
        storeResponse: register[i].response,
        order: register[i].order,
        pageId,
        templateId
      });
    }
    // now create the full page with all the registration records
    await Register.bulkCreate(bulkRegisterRecords, { transaction });

    // if we reach here, there were no errors therefore commit the transaction
    await transaction.commit();
    // fetch json
    res.status(200).send({
      message: "Successfully created Register Records."
    });
  } catch (error) {
    console.log(error.message);
    // if we reach here, there were some errors thrown, therefore roolback the transaction
    if (transaction) await transaction.rollback();
    res.status(500).send({
      message:
        error.message || "Some error occurred while creating the Register record."
    });
  }
};

export default {
  create,
}