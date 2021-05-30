import db from "../clients/database-client";
import { 
  normalizeUserAndTemplateData,
  formQuestionsIdsArray,
  formulateQuestionAnswerSpreadSheet,
  formGlobalSocialMediaPageIdsArray,
  formulateUserGlobalTracking,
  formulateUserPostActionsTracking,
  formulateUserPostLinkClickTracking,
  formulateUserPosts,
  formulateHeaders
} from './helper/admin-metrics-helper';

const getUserData = async (req, res, next) => {
  let transaction;
  try {
    if (!req.adminId) {
      res.status(400).send({
        message: "Invalid Token, please log in again!"
      });
      return;
    }

    const { templateId } = req.params;
    if (!templateId) {
      res.status(400).send({
        message: "Invalid template Id!"
      });
      return;
    }
    transaction = await db.sequelize.transaction();
    const allUserData = await db.User.findAll({
      where: {
        templateId,
      },
      include: [
        {
          where: {
            _id: templateId
          },
          model: db.Template,
          as: 'template',
          attributes: {
            include: [
              ['name', 'templateName'],
              'templateCode',
              'language'
            ],
            exclude: ['_id', 'adminId', 'videoPermission', 'audioPermission', 'cookiesPermission', 'qualtricsId']
          },
        },
        {
          model: db.UserAnswer,
          as: 'userQuestionAnswers',
          include: [
            {
              model: db.Question,
              as: 'question',
            },
            {
              model: db.McqOption,
              as: 'mcqOption',
            }
          ]
        },
        {
          model: db.UserGlobalTracking,
          as: 'userGlobalTracking',
          include: [
            {
              model: db.Page,
              as: 'pageConfigurations'
            }
          ]
        },
        {
          // will only select the posts which have userId associated with them
          model: db.UserPost,
          as: 'userPosts',
          include: [
            {
              // fetch any media associated with user created post
              model: db.Media,
              as: 'attachedMedia',
              attributes: {
                exclude: ['media', 'userPostId']
              }
            },
            {
              // for shared post fetch its parent post data
              model: db.UserPost,
              as: 'parentUserPost',
              include: [
                {
                  // fetch any media associated with its parent post
                  model: db.Media,
                  as: 'attachedMedia',
                  attributes: {
                    exclude: ['media', 'userPostId']
                  }
                }
              ]
            }
          ]
        },
        {
          model: db.UserPostAction,
          as: 'userPostActions',
          include: [
            {
              // we might need to show adminId where applicable
              model: db.UserPost,
              as: 'userPosts',
              attributes: ['_id', 'adminPostId']
            }
          ]
        },
        {
          model: db.UserPostTracking,
          as: 'userPostTracking',
          include: [
            {
              // we might need to show adminId where applicable
              model: db.UserPost,
              as: 'userPosts',
              attributes: ['_id', 'adminPostId']
            }
          ]
        }
      ]
    }, { transaction });

    const templateAdminPortalQuestionsData = await db.Template.findOne({
      where: {
        // adminId: req.adminId,
        _id: templateId,
      },
      include: [
        {
          // try to fetch all MCQ and OPENTEXT page
          where: {
            type: ['OPENTEXT', 'MCQ']
          },
          model: db.Page,
          as: 'pageFlowConfigurations',
          include: [
            {
              // what to include when fetching pages
              model: db.Question,
              as: 'question'
            }
          ]
        }
      ],
    }, { transaction});

    const globalSocialMediaPageData = await db.Template.findOne({
      where: {
        // adminId: req.adminId,
        _id: templateId,
      },
      include: [
        {
          // try to fetch all MCQ and OPENTEXT page
          where: {
            type: ['FACEBOOK', 'TWITTER']
          },
          model: db.Page,
          as: 'pageFlowConfigurations'
        }
      ],
    }, { transaction});
    
    // stringify and parse the globalSocialMediaPageData
    const globalSocialMediaPageJSONData = JSON.parse(JSON.stringify(globalSocialMediaPageData));
    const globalSocailMediaDynamicArray = formGlobalSocialMediaPageIdsArray(globalSocialMediaPageJSONData);

    // stringify and parse the allUserData
    const allUserJSONData = JSON.parse(JSON.stringify(allUserData));

    // stringify and parse the allUserData
    const templateAdminPortalQuestionsJSONData = JSON.parse(JSON.stringify(templateAdminPortalQuestionsData));
    // normalize the templateAdminPortalQuestionsData to make dynamic headers
    const questionIdsDynamicArray = formQuestionsIdsArray(templateAdminPortalQuestionsJSONData);

    
    const spreadsheetData = [];
    spreadsheetData.push(formulateHeaders(questionIdsDynamicArray, globalSocailMediaDynamicArray));
    // fetch all the data from all the user responses
    for (let i = 0; i < allUserJSONData.length; i++) {
      // fetch individual user responses
      const {
        template,
        userQuestionAnswers,
        userGlobalTracking,
        userPosts,
        userPostActions,
        userPostTracking,
        ...userResponse
      } = allUserJSONData[i];

      // for userResponse try to add it to the
      const eachRow = [];
      // try to add everything for userResponse and template specific
      const userResponseAndTemplate = {
        ...userResponse,
        ...template
      };
      eachRow = [ ...eachRow, ...normalizeUserAndTemplateData(userResponseAndTemplate)];
      // try to add everything for userQuestionAnswers
      // Step 1: fetch all the possible questions for a template so that we know what the headers look like
      // second while iterating through them add the mcq answers from the user response
      eachRow = [...eachRow, ...formulateQuestionAnswerSpreadSheet(questionIdsDynamicArray, userQuestionAnswers)]
      // output userGlobalTracking 
      eachRow = [ ...eachRow, ...formulateUserGlobalTracking(globalSocailMediaDynamicArray, userGlobalTracking)];
      // output userPostActions
      eachRow = [ ...eachRow, ...formulateUserPostActionsTracking(userPostActions)];
      // output userPostTracking
      eachRow = [ ...eachRow, formulateUserPostLinkClickTracking(userPostTracking)];
      // output userPosts
      eachRow = [ ...eachRow, ...formulateUserPosts(userPosts)];

      spreadsheetData.push(eachRow);
    }

    res.send({
      response: allUserData || [],
      CSVResponses: spreadsheetData || [],
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      message: "Some error occurred while fetching metrics data."
    });
  }
};

const getTemplatesWithUserCounts = async (req, res, next) => {
  try {
    if (!req.adminId) {
      res.status(400).send({
        message: "Invalid Token, please log in again!"
      });
      return;
    }

    const data = await db.Template.findAll({
      where: {
        adminId: req.adminId,
      },
      group: ['Template._id'],
      attributes: [
          [db.sequelize.fn("SUM", db.sequelize.literal('CASE WHEN user.\`_id\` is not null THEN 1 ELSE 0 end')), 'userEntries'],
          ['_id', 'templateId'],
          ['name', 'templateName']
      ],
      include: [
        {
          model: db.User,
          as: 'user',
          attributes: []
        }
      ]
    });

    res.send({
      response: data
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).send({
      message: "Some error occurred while fetching Templates with user Counts."
    });
  }
};

export default {
  getUserData,
  getTemplatesWithUserCounts
}
